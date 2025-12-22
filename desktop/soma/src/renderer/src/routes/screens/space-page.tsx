import { YooptaEditorWithTools } from "@renderer/components/yoopta/yoopta-editor-with-tools";
import { readMailbox, writeMailbox } from "@renderer/lib/document-mailbox";
import {
	getPageDoc,
	getPageSnapshot,
	pageDocKey,
	setPageContent,
	setPageTitle,
} from "@renderer/lib/yjs-doc";
import {
	useQueueDaemonSyncMutation,
	useSyncPublishedDocumentMutation,
	useUpsertDocumentDraftMutation,
} from "@renderer/queries/documents";
import {
	useSetPageParentsMutation,
	useUpdatePageTitleMutation,
} from "@renderer/queries/pages";
import { useDocumentsStore } from "@renderer/store/documents";
import type { YooptaContentValue } from "@yoopta/editor";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { type LoaderFunctionArgs, useLoaderData } from "react-router";
import { useDebounce } from "use-debounce";

const pageLoaderCache = new Map<string, LoaderData>();
const MAILBOX_WRITE_MS = 500;

type LoaderData = {
	spaceId: string;
	pageId: string;
	title: string;
	parentPageIds: string[];
	initialContentJson: string | null;
	initialUpdatedAtMs: number;
};

function newId(): string {
	if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
		return crypto.randomUUID();
	}
	return `blk_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function parseContent(
	contentJson: string | null,
): YooptaContentValue | undefined {
	if (!contentJson) return undefined;
	try {
		const parsed = JSON.parse(contentJson) as YooptaContentValue | null;
		if (parsed === null) return undefined;
		return parsed;
	} catch {
		return undefined;
	}
}

function appendAiSuggestion(
	currentJson: string | null,
	suggestion: string,
): string {
	const aiBlock = {
		id: newId(),
		type: "paragraph",
		children: [{ text: suggestion }],
	};
	try {
		const parsed = JSON.parse(currentJson ?? "[]");
		if (Array.isArray(parsed)) {
			parsed.push(aiBlock);
			return JSON.stringify(parsed);
		}
	} catch {
		// fall through
	}
	return JSON.stringify([aiBlock]);
}

async function loader({ params }: LoaderFunctionArgs): Promise<LoaderData> {
	const spaceId = params.spaceId ?? "";
	const pageId = params.pageId ?? "";
	if (!spaceId || !pageId) {
		throw new Response("Missing space or page", { status: 400 });
	}
	const cacheKey = `${spaceId}:${pageId}`;
	const cached = pageLoaderCache.get(cacheKey);
	if (cached) return cached;

	const [page, draft] = await Promise.all([
		window.api.documents.ensurePage({
			spaceId,
			pageId,
			title: pageId,
		}),
		window.api.documents.getDraft({ spaceId, documentId: pageId }),
	]);

	const mailbox = readMailbox(spaceId, pageId);
	let initialContentJson = mailbox?.contentJson ?? null;
	let initialUpdatedAtMs = mailbox?.updatedAtMs ?? 0;
	const title = mailbox?.title ?? page.title;

	if (draft && draft.updatedAtMs >= initialUpdatedAtMs) {
		initialContentJson = draft.contentJson;
		initialUpdatedAtMs = draft.updatedAtMs;
	}

	if (!initialUpdatedAtMs) initialUpdatedAtMs = Date.now();

	const result: LoaderData = {
		spaceId,
		pageId,
		title,
		parentPageIds: page.parentPageIds,
		initialContentJson,
		initialUpdatedAtMs,
	};
	pageLoaderCache.set(cacheKey, result);
	return result;
}

function Component(): React.JSX.Element {
	const { t } = useTranslation("common");
	const data = useLoaderData() as LoaderData;

	const ensure = useDocumentsStore((s) => s.ensure);
	const setContentJson = useDocumentsStore((s) => s.setContentJson);
	const setPublished = useDocumentsStore((s) => s.setPublished);

	const docKey = useMemo(
		() => pageDocKey(data.spaceId, data.pageId),
		[data.pageId, data.spaceId],
	);
	const pageDoc = useMemo(
		() =>
			getPageDoc(docKey, {
				title: data.title,
				contentJson: data.initialContentJson,
				updatedAtMs: data.initialUpdatedAtMs,
			}),
		[docKey, data.initialContentJson, data.initialUpdatedAtMs, data.title],
	);
	const [snapshot, setSnapshot] = useState(() => getPageSnapshot(pageDoc));
	const [parentsInput, setParentsInput] = useState(
		data.parentPageIds.join(", "),
	);
	const [aiLoading, setAiLoading] = useState(false);
	const mailboxTimerRef = useRef<number | null>(null);
	const lastMailboxPayload = useRef<string | null>(null);

	useEffect(() => {
		if (!data.spaceId || !data.pageId) return;
		ensure(data.spaceId, data.pageId);
		setPublished(data.spaceId, data.pageId, true);
	}, [data.pageId, data.spaceId, ensure, setPublished]);

	useEffect(() => {
		setParentsInput(data.parentPageIds.join(", "));
	}, [data.parentPageIds]);

	useEffect(() => {
		const handleUpdate = () => {
			const next = getPageSnapshot(pageDoc);
			if (
				next.contentJson === snapshot.contentJson &&
				next.title === snapshot.title &&
				next.updatedAtMs === snapshot.updatedAtMs
			) {
				return;
			}
			setSnapshot(next);
			if (mailboxTimerRef.current) {
				window.clearTimeout(mailboxTimerRef.current);
			}
			mailboxTimerRef.current = window.setTimeout(() => {
				const payload = JSON.stringify({
					contentJson: next.contentJson,
					title: next.title,
					updatedAtMs: next.updatedAtMs,
				});
				if (payload !== lastMailboxPayload.current) {
					writeMailbox(data.spaceId, data.pageId, {
						contentJson: next.contentJson,
						title: next.title,
						updatedAtMs: next.updatedAtMs,
					});
					const serialized = next.contentJson ?? "null";
					setContentJson(data.spaceId, data.pageId, serialized);
					lastMailboxPayload.current = payload;
				}
			}, MAILBOX_WRITE_MS);
		};
		handleUpdate();
		pageDoc.on("update", handleUpdate);
		return () => {
			if (mailboxTimerRef.current) {
				window.clearTimeout(mailboxTimerRef.current);
				mailboxTimerRef.current = null;
			}
			pageDoc.off("update", handleUpdate);
		};
	}, [data.pageId, data.spaceId, pageDoc, setContentJson]);

	const initialValue = useMemo(
		() => parseContent(data.initialContentJson ?? snapshot.contentJson),
		[data.initialContentJson, docKey, snapshot.contentJson],
	);

	const [sqliteDebouncedContentJson] = useDebounce(snapshot.contentJson, 350);
	const [daemonDebouncedContentJson] = useDebounce(snapshot.contentJson, 4500);
	const [debouncedTitle] = useDebounce(snapshot.title, 300);
	const [debouncedParents] = useDebounce(parentsInput, 400);

	const upsertDraft = useUpsertDocumentDraftMutation();
	const syncPublished = useSyncPublishedDocumentMutation();
	const queueDaemonSync = useQueueDaemonSyncMutation();
	const updateTitle = useUpdatePageTitleMutation();
	const setParents = useSetPageParentsMutation();

	const runInlineAi = async () => {
		setAiLoading(true);
		try {
			const res = await window.api.agent.inlineComplete({
				prompt: snapshot.title,
				context: snapshot.contentJson ?? "",
			});
			if (res?.completion) {
				const next = appendAiSuggestion(snapshot.contentJson, res.completion);
				setPageContent(pageDoc, next);
			}
		} catch {
			// ignore
		} finally {
			setAiLoading(false);
		}
	};

	useEffect(() => {
		if (!data.spaceId || !data.pageId) return;
		if (sqliteDebouncedContentJson === null) return;
		upsertDraft.mutate({
			spaceId: data.spaceId,
			documentId: data.pageId,
			contentJson: sqliteDebouncedContentJson,
			published: true,
		});
	}, [data.pageId, data.spaceId, sqliteDebouncedContentJson, upsertDraft]);

	useEffect(() => {
		if (!data.spaceId || !data.pageId) return;
		if (daemonDebouncedContentJson === null) return;
		const updatedAtMs = snapshot.updatedAtMs || Date.now();
		syncPublished
			.mutateAsync({
				spaceId: data.spaceId,
				documentId: data.pageId,
				contentJson: daemonDebouncedContentJson,
				updatedAtMs,
			})
			.catch(() => {
				queueDaemonSync.mutate({
					spaceId: data.spaceId,
					documentId: data.pageId,
					contentJson: daemonDebouncedContentJson,
					updatedAtMs,
					published: true,
				});
			});
	}, [
		daemonDebouncedContentJson,
		data.pageId,
		data.spaceId,
		queueDaemonSync,
		snapshot.updatedAtMs,
		syncPublished,
	]);

	useEffect(() => {
		if (!data.spaceId || !data.pageId) return;
		if (!debouncedTitle.trim()) return;
		updateTitle.mutate({
			spaceId: data.spaceId,
			pageId: data.pageId,
			title: debouncedTitle,
		});
	}, [data.pageId, data.spaceId, debouncedTitle, updateTitle]);

	useEffect(() => {
		if (!data.spaceId || !data.pageId) return;
		const parentPageIds = debouncedParents
			.split(",")
			.map((p) => p.trim())
			.filter(Boolean);
		setParents.mutate({
			spaceId: data.spaceId,
			pageId: data.pageId,
			parentPageIds,
		});
	}, [data.pageId, data.spaceId, debouncedParents, setParents]);

	return (
		<div className="flex flex-col gap-4">
			<div className="flex flex-col gap-2 px-2">
				<input
					className="input input-bordered font-semibold text-2xl"
					onChange={(event) => setPageTitle(pageDoc, event.target.value)}
					placeholder={t("space.pages.titlePlaceholder", "Untitled page")}
					value={snapshot.title}
				/>
				<label className="form-control w-full max-w-xl">
					<div className="label py-1">
						<span className="label-text text-base-content/70 text-xs">
							{t("space.pages.parentsLabel", "Parents (comma separated)")}
						</span>
					</div>
					<input
						className="input input-bordered input-sm"
						onChange={(event) => setParentsInput(event.target.value)}
						placeholder={t(
							"space.pages.parentsPlaceholder",
							"parent-a, parent-b",
						)}
						value={parentsInput}
					/>
				</label>
			</div>

			<div className="flex">
				<YooptaEditorWithTools
					className="!w-full px-12"
					initialValue={initialValue}
					inlineAiBusy={aiLoading}
					onInlineAi={runInlineAi}
					onValueChange={(value) => {
						try {
							const serialized = JSON.stringify(value ?? null);
							setPageContent(pageDoc, serialized);
						} catch {
							// ignore serialization failures
						}
					}}
					placeholder={t("space.pages.editorPlaceholder", "Start writing…")}
				/>
			</div>
		</div>
	);
}

export { Component, loader };
