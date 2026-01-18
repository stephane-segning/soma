import { YooptaEditorWithTools } from "@renderer/components/yoopta/yoopta-editor-with-tools";
import type { YooptaContentValue, YooptaOnChangeOptions } from "@yoopta/editor";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { HotkeysProvider } from "react-hotkeys-hook";
import { type LoaderFunctionArgs, useLoaderData } from "react-router";
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

	return (
		<div className="h-full min-h-full px-14">
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
					style={{ width: "unset" }}
				/>
			</HotkeysProvider>
		</div>
	);
}

export { Component, loader };
