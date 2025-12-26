import { YooptaEditorWithTools } from "@soma/components/yoopta/yoopta-editor-with-tools";
import {
	useQueueDaemonSyncMutation,
	useUpsertDocumentDraftMutation,
} from "@soma/queries/documents";
import type { YooptaContentValue } from "@yoopta/editor";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type LoaderFunctionArgs, useLoaderData } from "react-router";
import { useDebounce } from "react-use";
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

	const [contentJson, setContentJson] = useState<string>(
		data.initialContentJson ?? "null",
	);
	const contentValue = useMemo(() => parseContent(contentJson), [contentJson]);

	const queueDaemonSync = useQueueDaemonSyncMutation();
	const upsertDraft = useUpsertDocumentDraftMutation();
	const latestSerializedRef = useRef("");

	useDebounce(
		() => {
			if (!data.spaceId || !data.pageId) return;

			upsertDraft.mutate({
				spaceId: data.spaceId,
				documentId: data.pageId,
				published: true,
				contentJson,
			});
			queueDaemonSync.mutate({
				spaceId: data.spaceId,
				documentId: data.pageId,
				updatedAtMs: Date.now(),
				published: true,
				contentJson,
			});
		},
		5,
		[contentJson],
	);

	useEffect(() => {
		latestSerializedRef.current = contentJson;
	}, [contentJson]);

	const handleSave = useCallback(() => {
		if (!data.spaceId || !data.pageId) return;

		const payload = latestSerializedRef.current;
		if (!payload) return;
		try {
			// Validate JSON before persisting to avoid corrupt drafts.
			JSON.parse(payload);
		} catch {
			return;
		}

		const now = Date.now();
		upsertDraft.mutate({
			spaceId: data.spaceId,
			documentId: data.pageId,
			contentJson: payload,
			published: true,
		});
		queueDaemonSync.mutate({
			spaceId: data.spaceId,
			documentId: data.pageId,
			contentJson: payload,
			updatedAtMs: now,
			published: true,
		});
	}, [data.pageId, data.spaceId, queueDaemonSync, upsertDraft]);

	return (
		<div className="flex flex-col gap-4 px-4">
			<YooptaEditorWithTools
				className="!w-full"
				initialValue={contentValue}
				key={`${data.spaceId}:${data.pageId}`}
				onSave={handleSave}
				onValueChange={(value) => {
					try {
						const serialized = JSON.stringify(value ?? null);
						if (serialized === contentJson) return;
						setContentJson(serialized);
						latestSerializedRef.current = serialized;
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
