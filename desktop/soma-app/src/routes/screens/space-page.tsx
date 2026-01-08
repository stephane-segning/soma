import { YooptaEditorWithTools } from "@soma/components/yoopta/yoopta-editor-with-tools";
import { usePagesQuery } from "@soma/queries/pages";
import type { YooptaContentValue, YooptaOnChangeOptions } from "@yoopta/editor";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { Bookmark, Clock, MessageCircle, MoreHorizontal } from "react-feather";
import { HotkeysProvider } from "react-hotkeys-hook";
import { Link, type LoaderFunctionArgs, useLoaderData } from "react-router";
import * as documentsService from "../../services/documents-service";

type LoaderData = {
	spaceId: string;
	pageId: string;
	initialContentJson: string | null;
};

function parseContent(
	contentJson: string | null,
): YooptaContentValue | undefined {
	if (!contentJson) return undefined;
	try {
		const parsed = JSON.parse(contentJson) as YooptaContentValue | null;
		return parsed ?? undefined;
	} catch {
		return undefined;
	}
}

function isMeaningfulChange(options: YooptaOnChangeOptions): boolean {
	const operations = options.operations ?? [];
	if (operations.length === 0) return true;

	return operations.some((operation) => {
		if (
			operation.type === "set_block_path" ||
			operation.type === "validate_block_paths" ||
			operation.type === "set_editor_value"
		) {
			return false;
		}

		if (operation.type === "set_slate") {
			return operation.properties.slateOps.some(
				(op) => op.type !== "set_selection",
			);
		}

		return true;
	});
}

async function loader({ params }: LoaderFunctionArgs): Promise<LoaderData> {
	const spaceId = params.spaceId ?? "";
	const pageId = params.pageId ?? "";
	if (!spaceId || !pageId) {
		throw new Response("Missing space or page", { status: 400 });
	}

	// Minimal fetch: try to hydrate from drafts; fall back to empty.
	const draft = await documentsService.getDraft({
		spaceId,
		documentId: pageId,
	});

	return {
		spaceId,
		pageId,
		initialContentJson: draft?.contentJson ?? null,
	};
}

function Component(): React.JSX.Element {
	const data = useLoaderData<LoaderData>();
	const pagesQuery = usePagesQuery(data.spaceId);

	const initialValue = useMemo(
		() => parseContent(data.initialContentJson),
		[data.initialContentJson],
	);

	const latestValueRef = useRef<YooptaContentValue | undefined>(initialValue);
	const dirtyRef = useRef(false);
	const savingRef = useRef(false);
	const autosaveTimerRef = useRef<number | null>(null);

	useEffect(() => {
		latestValueRef.current = initialValue;
		dirtyRef.current = false;
		if (autosaveTimerRef.current) {
			window.clearTimeout(autosaveTimerRef.current);
			autosaveTimerRef.current = null;
		}
	}, [initialValue]);

	useEffect(() => {
		return () => {
			if (autosaveTimerRef.current) {
				window.clearTimeout(autosaveTimerRef.current);
			}
		};
	}, []);

	const flushSave = useCallback(async () => {
		if (!data.spaceId || !data.pageId) return;
		if (savingRef.current) return;
		if (!dirtyRef.current) return;

		savingRef.current = true;
		try {
			while (dirtyRef.current) {
				dirtyRef.current = false;

				const contentJson = JSON.stringify(latestValueRef.current ?? null);
				await documentsService.queueDaemonSync({
					spaceId: data.spaceId,
					documentId: data.pageId,
					updatedAtMs: Date.now(),
					published: true,
					contentJson,
				});
			}
		} catch (error) {
			dirtyRef.current = true;
			console.warn("Failed to sync document to daemon", error);
		} finally {
			savingRef.current = false;
		}
	}, [data.pageId, data.spaceId]);

	const scheduleAutosave = useCallback(() => {
		if (autosaveTimerRef.current) {
			window.clearTimeout(autosaveTimerRef.current);
		}
		autosaveTimerRef.current = window.setTimeout(() => {
			autosaveTimerRef.current = null;
			void flushSave();
		}, 750);
	}, [flushSave]);

	const handleSave = useCallback(() => {
		dirtyRef.current = true;
		if (autosaveTimerRef.current) {
			window.clearTimeout(autosaveTimerRef.current);
			autosaveTimerRef.current = null;
		}
		void flushSave();
	}, [flushSave]);

	const handleValueChange = useCallback(
		(value: YooptaContentValue, options: YooptaOnChangeOptions) => {
			latestValueRef.current = value;
			if (!isMeaningfulChange(options)) return;

			dirtyRef.current = true;
			scheduleAutosave();
		},
		[scheduleAutosave],
	);

	const pages = pagesQuery.data ?? [];
	const page = pages.find((p) => p.pageId === data.pageId);

	const breadcrumbs = useMemo(() => {
		if (!page) return [];
		const map = new Map(pages.map((p) => [p.pageId, p]));
		const chain = [];
		const seen = new Set<string>();
		let cursor: typeof page | undefined = page;
		while (cursor && !seen.has(cursor.pageId)) {
			chain.push(cursor);
			seen.add(cursor.pageId);
			const parentId = cursor.parentPageIds[0];
			cursor = parentId ? map.get(parentId) : undefined;
		}
		return chain.reverse();
	}, [page, pages]);

	const lastEditedLabel = useMemo(() => {
		const updatedAtMs = page?.updatedAtMs ?? null;
		if (!updatedAtMs) return "just now";
		const delta = Date.now() - updatedAtMs;
		const minutes = Math.floor(delta / (60 * 1000));
		if (minutes <= 1) return "just now";
		if (minutes < 60) return `${minutes}m ago`;
		const hours = Math.floor(minutes / 60);
		if (hours < 24) return `${hours}h ago`;
		const days = Math.floor(hours / 24);
		if (days < 30) return `${days}d ago`;
		const months = Math.floor(days / 30);
		return `${months}mo ago`;
	}, [page]);

	return (
		<div className="flex justify-center bg-base-100">
			<div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-8">
				<div className="flex flex-wrap items-center justify-between gap-2 text-base-content/70 text-sm">
					<div className="flex flex-wrap items-center gap-2 text-base-content/60 text-xs">
						<Link
							className="hover:underline"
							to={`/spaces/${data.spaceId}/pages`}
						>
							Home
						</Link>
						{breadcrumbs.map((crumb, index) => (
							<span className="flex items-center gap-2" key={crumb.pageId}>
								<span className="text-base-content/40">/</span>
								{index === breadcrumbs.length - 1 ? (
									<span className="font-medium text-base-content">
										{crumb.title || "Untitled"}
									</span>
								) : (
									<Link
										className="hover:underline"
										to={`/spaces/${crumb.spaceId}/pages/${crumb.pageId}`}
									>
										{crumb.title || "Untitled"}
									</Link>
								)}
							</span>
						))}
					</div>
					<div className="flex items-center gap-1">
						<button className="btn btn-ghost btn-sm" type="button">
							<MessageCircle className="size-4" />
						</button>
						<button className="btn btn-ghost btn-sm" type="button">
							<Clock className="size-4" />
						</button>
						<button className="btn btn-ghost btn-sm" type="button">
							<Bookmark className="size-4" />
						</button>
						<button className="btn btn-ghost btn-sm" type="button">
							<MoreHorizontal className="size-4" />
						</button>
					</div>
				</div>

				<HotkeysProvider initiallyActiveScopes={["rich-text"]}>
					<YooptaEditorWithTools
						className="!w-full"
						documentId={data.pageId}
						initialValue={initialValue}
						key={`${data.spaceId}:${data.pageId}`}
						onSave={handleSave}
						onValueChange={handleValueChange}
						placeholder="Start writing…"
						spaceId={data.spaceId}
					/>
				</HotkeysProvider>
			</div>
		</div>
	);
}

export { Component, loader };
