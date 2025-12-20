import { YooptaEditorWithTools } from "@renderer/components/yoopta/yoopta-editor-with-tools";
import {
	useDocumentDraftQuery,
	useQueueDaemonSyncMutation,
	useSyncPublishedDocumentMutation,
	useUpsertDocumentDraftMutation,
} from "@renderer/queries/documents";
import { useDocumentsStore } from "@renderer/store/documents";
import type { YooptaContentValue } from "@yoopta/editor";
import { useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router";
import { useDebounce } from "use-debounce";

function Component(): React.JSX.Element {
	const { t } = useTranslation("common");
	const { spaceId, pageId } = useParams();

	const resolvedSpaceId = spaceId ?? "";
	const resolvedDocumentId = pageId ?? "";
	const ensure = useDocumentsStore((s) => s.ensure);
	const hydrateFromDraft = useDocumentsStore((s) => s.hydrateFromDraft);
	const setContentJson = useDocumentsStore((s) => s.setContentJson);
	const setPublished = useDocumentsStore((s) => s.setPublished);

	const contentJson = useDocumentsStore(
		(s) =>
			s.byKey[`${resolvedSpaceId}:${resolvedDocumentId}`]?.contentJson ?? null,
	);
	const published = useDocumentsStore(
		(s) =>
			s.byKey[`${resolvedSpaceId}:${resolvedDocumentId}`]?.published ?? false,
	);

	useEffect(() => {
		if (!resolvedSpaceId || !resolvedDocumentId) return;
		ensure(resolvedSpaceId, resolvedDocumentId);
		// For now: space pages are considered "published" documents.
		setPublished(resolvedSpaceId, resolvedDocumentId, true);
	}, [ensure, resolvedSpaceId, resolvedDocumentId, setPublished]);

	const draftQuery = useDocumentDraftQuery(resolvedSpaceId, resolvedDocumentId);

	useEffect(() => {
		if (!draftQuery.data) return;
		hydrateFromDraft(draftQuery.data);
	}, [draftQuery.data, hydrateFromDraft]);

	const initialValue = useMemo((): YooptaContentValue | undefined => {
		if (!contentJson) return undefined;
		try {
			return JSON.parse(contentJson) as YooptaContentValue;
		} catch {
			return undefined;
		}
	}, [contentJson]);

	const [localDebouncedContentJson] = useDebounce(contentJson, 500);
	const [daemonDebouncedContentJson] = useDebounce(contentJson, 5000);

	const upsertDraft = useUpsertDocumentDraftMutation();
	const syncPublished = useSyncPublishedDocumentMutation();
	const queueDaemonSync = useQueueDaemonSyncMutation();

	useEffect(() => {
		if (!resolvedSpaceId || !resolvedDocumentId) return;
		if (!localDebouncedContentJson) return;
		upsertDraft.mutate({
			spaceId: resolvedSpaceId,
			documentId: resolvedDocumentId,
			contentJson: localDebouncedContentJson,
			published,
		});
	}, [
		localDebouncedContentJson,
		published,
		resolvedDocumentId,
		resolvedSpaceId,
		upsertDraft,
	]);

	useEffect(() => {
		if (!resolvedSpaceId || !resolvedDocumentId) return;
		if (!published) return;
		if (!daemonDebouncedContentJson) return;
		const updatedAtMs = Date.now();
		syncPublished
			.mutateAsync({
				spaceId: resolvedSpaceId,
				documentId: resolvedDocumentId,
				contentJson: daemonDebouncedContentJson,
				updatedAtMs,
			})
			.catch(() => {
				queueDaemonSync.mutate({
					spaceId: resolvedSpaceId,
					documentId: resolvedDocumentId,
					contentJson: daemonDebouncedContentJson,
					updatedAtMs,
				});
			});
	}, [
		daemonDebouncedContentJson,
		published,
		queueDaemonSync,
		syncPublished,
		resolvedDocumentId,
		resolvedSpaceId,
	]);

	return (
		<div className="flex">
			<YooptaEditorWithTools
				className="!w-full px-12"
				initialValue={initialValue}
				onValueChange={(value) => {
					if (!resolvedSpaceId || !resolvedDocumentId) return;
					try {
						setContentJson(
							resolvedSpaceId,
							resolvedDocumentId,
							JSON.stringify(value ?? null),
						);
					} catch {
						// ignore serialization failures
					}
				}}
				placeholder={t("space.pages.editorPlaceholder", "Start writing…")}
			/>
		</div>
	);
}

export { Component };
