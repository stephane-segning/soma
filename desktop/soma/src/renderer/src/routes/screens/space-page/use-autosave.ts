import type { JSONContent } from "@soma/editor";
import { useCallback, useEffect, useRef } from "react";
import * as documentsService from "../../../services/documents-service";
import { deriveTitleFromDocument, normalizePageTitle, shouldSyncDerivedTitle } from "../page-title";

type UsePageAutosaveInput = {
	spaceId: string;
	pageId: string;
	pageTitle: string;
	initialValue: JSONContent | undefined;
};

export function usePageAutosave({ spaceId, pageId, pageTitle, initialValue }: UsePageAutosaveInput): {
	onValueChange: (value: JSONContent) => void;
	noteTitleSynced: (title: string) => void;
} {
	const latestValueRef = useRef<JSONContent | undefined>(initialValue);
	const dirtyRef = useRef(false);
	const savingRef = useRef(false);
	const autosaveTimerRef = useRef<number | null>(null);
	const syncedTitleRef = useRef<string | null>(null);
	const currentPageTitleRef = useRef<string>(pageTitle);

	useEffect(() => {
		latestValueRef.current = initialValue;
		dirtyRef.current = false;
		if (autosaveTimerRef.current) {
			window.clearTimeout(autosaveTimerRef.current);
		}
		autosaveTimerRef.current = null;
		currentPageTitleRef.current = pageTitle;
		syncedTitleRef.current = null;
	}, [pageTitle, initialValue]);

	useEffect(() => {
		return () => {
			if (autosaveTimerRef.current) {
				window.clearTimeout(autosaveTimerRef.current);
			}
		};
	}, []);

	const flushSave = useCallback(async () => {
		if (!spaceId || !pageId) return;
		if (savingRef.current) return;
		if (!dirtyRef.current) return;

		savingRef.current = true;
		try {
			while (dirtyRef.current) {
				dirtyRef.current = false;

				const latestValue = latestValueRef.current;
				const nextTitle = deriveTitleFromDocument(latestValue);
				if (
					shouldSyncDerivedTitle({
						currentPageTitle: currentPageTitleRef.current,
						lastSyncedTitle: syncedTitleRef.current,
						nextDerivedTitle: nextTitle,
					})
				) {
					const updated = await documentsService.updatePageTitle({
						spaceId,
						pageId,
						title: nextTitle,
					});
					if (updated?.title) {
						syncedTitleRef.current = updated.title;
						currentPageTitleRef.current = normalizePageTitle(updated.title);
					}
				}

				await documentsService.queueDaemonSync({
					spaceId,
					documentId: pageId,
					updatedAtMs: Date.now(),
					published: true,
					contentJson: JSON.stringify(latestValue ?? null),
				});
			}
		} catch (error) {
			dirtyRef.current = true;
			console.warn("Failed to sync document to daemon", error);
		} finally {
			savingRef.current = false;
		}
	}, [pageId, spaceId]);

	const scheduleAutosave = useCallback(() => {
		if (autosaveTimerRef.current) {
			window.clearTimeout(autosaveTimerRef.current);
		}
		autosaveTimerRef.current = window.setTimeout(() => {
			autosaveTimerRef.current = null;
			void flushSave();
		}, 750);
	}, [flushSave]);

	const onValueChange = useCallback(
		(value: JSONContent) => {
			latestValueRef.current = value;
			dirtyRef.current = true;
			scheduleAutosave();
		},
		[scheduleAutosave],
	);

	const noteTitleSynced = useCallback((title: string) => {
		currentPageTitleRef.current = normalizePageTitle(title);
		syncedTitleRef.current = title;
	}, []);

	return { onValueChange, noteTitleSynced };
}
