import { YooptaEditorWithTools } from "@renderer/components/yoopta/yoopta-editor-with-tools";
import {
	useQueueDaemonSyncMutation,
	useUpsertDocumentDraftMutation,
} from "@renderer/queries/documents";
import type { YooptaContentValue } from "@yoopta/editor";
import { useEffect, useMemo, useRef, useState } from "react";
import { type LoaderFunctionArgs, useLoaderData } from "react-router";
import { useDebouncedCallback } from "use-debounce";

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

async function loader({ params }: LoaderFunctionArgs): Promise<LoaderData> {
	const spaceId = params.spaceId ?? "";
	const pageId = params.pageId ?? "";
	if (!spaceId || !pageId) {
		throw new Response("Missing space or page", { status: 400 });
	}

	// Minimal fetch: try to hydrate from drafts; fall back to empty.
	const draft = await window.api.documents.getDraft({
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
	const data = useLoaderData() as LoaderData;

	const [contentJson, setContentJson] = useState<string>(
		data.initialContentJson ?? "null",
	);
	const contentValue = useMemo(() => parseContent(contentJson), [contentJson]);

	const queueDaemonSync = useQueueDaemonSyncMutation();
	const upsertDraft = useUpsertDocumentDraftMutation();
	const lastSentRef = useRef<string | null>(null);
	const reloadingRef = useRef(false);

	// When navigation changes the page, reset local state and sent tracker.
	useEffect(() => {
		setContentJson(data.initialContentJson ?? `null-${data.pageId}`);
		lastSentRef.current = null;
	}, [data.pageId, data.initialContentJson]);

	// Refresh latest draft when window gains focus so other tabs' edits are seen.
	useEffect(() => {
		const handler = async () => {
			if (reloadingRef.current) return;
			reloadingRef.current = true;
			try {
				const draft = await window.api.documents.getDraft({
					spaceId: data.spaceId,
					documentId: data.pageId,
				});
				const next = draft?.contentJson ?? "null";
				if (next !== contentJson) {
					setContentJson(next);
					lastSentRef.current = null;
				}
			} finally {
				reloadingRef.current = false;
			}
		};
		window.addEventListener("focus", handler);
		return () => window.removeEventListener("focus", handler);
	}, [data.pageId, data.spaceId, contentJson]);

	const sendDebounced = useDebouncedCallback(
		(nextContent: string, nextUpdatedAt: number) => {
			if (!data.spaceId || !data.pageId) return;
			if (lastSentRef.current === nextContent) return;
			lastSentRef.current = nextContent;
			upsertDraft.mutate({
				spaceId: data.spaceId,
				documentId: data.pageId,
				contentJson: nextContent,
				published: true,
			});
			queueDaemonSync.mutate({
				spaceId: data.spaceId,
				documentId: data.pageId,
				contentJson: nextContent,
				updatedAtMs: nextUpdatedAt,
				published: true,
			});
		},
		5,
	);

	return (
		<div className="flex flex-col gap-4 px-4">
			<YooptaEditorWithTools
				className="!w-full"
				initialValue={contentValue}
				key={`${data.spaceId}:${data.pageId}`}
				onValueChange={(value) => {
					try {
						const now = Date.now();
						const serialized = JSON.stringify(value ?? null);
						if (serialized === contentJson) return;
						setContentJson(serialized);
						sendDebounced(serialized, now);
					} catch {
						// ignore serialization failures
					}
				}}
				placeholder="Start writing…"
			/>
		</div>
	);
}

export { Component, loader };
