import { useAppDispatch } from "@app/store/hooks";
import { recentPagesActions } from "@app/store/recent-pages";
import { tabsActions } from "@app/store/tabs";
import { DocumentEditor, type JSONContent } from "@soma/editor";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ErrorBoundary } from "react-error-boundary";
import { HotkeysProvider } from "react-hotkeys-hook";
import { useLoaderData } from "react-router";
import * as documentsService from "../../services/documents-service";
import { isDocumentEffectivelyEmpty, UNTITLED_PAGE_TITLE } from "./page-title";
import { usePageEditorCommands } from "./space-page/editor-commands";
import { PageEditorFallback } from "./space-page/fallback";
import { loader } from "./space-page/loader";
import { usePageMentionProviders } from "./space-page/mentions";
import { PageLinkPicker } from "./space-page/page-link-picker";
import { usePageQuickActions } from "./space-page/quick-actions";
import type { EditorLike, LoaderData, PageRecord, PendingPageInsert } from "./space-page/types";
import { usePageUploads } from "./space-page/uploads";
import { usePageAutosave } from "./space-page/use-autosave";

function parseContent(contentJson: string | null): JSONContent | undefined {
	if (!contentJson) return undefined;
	try {
		const parsed = JSON.parse(contentJson) as JSONContent | null;
		return parsed ?? undefined;
	} catch {
		return undefined;
	}
}

function Component(): React.JSX.Element {
	const data = useLoaderData<LoaderData>();
	const dispatch = useAppDispatch();
	const pendingPageInsertRef = useRef<PendingPageInsert | null>(null);
	const [isPagePickerOpen, setIsPagePickerOpen] = useState(false);

	useEffect(() => {
		dispatch(
			recentPagesActions.recordPageOpened({
				spaceId: data.spaceId,
				pageId: data.pageId,
				title: data.pageTitle,
				openedAt: Date.now(),
			}),
		);
	}, [dispatch, data.spaceId, data.pageId, data.pageTitle]);

	const initialValue = useMemo(() => parseContent(data.initialContentJson), [data.initialContentJson]);
	const showEmptyPageHint = useMemo(() => isDocumentEffectivelyEmpty(initialValue), [initialValue]);
	const { noteTitleSynced, onValueChange } = usePageAutosave({
		spaceId: data.spaceId,
		pageId: data.pageId,
		pageTitle: data.pageTitle,
		initialValue,
	});
	const { uploadFile, uploadImage } = usePageUploads({ spaceId: data.spaceId, pageId: data.pageId });

	const handleOpenPagePicker = useCallback((editor: EditorLike, range: { from: number; to: number }) => {
		pendingPageInsertRef.current = { editor, range };
		setIsPagePickerOpen(true);
	}, []);

	const handleClosePagePicker = useCallback(() => {
		pendingPageInsertRef.current = null;
		setIsPagePickerOpen(false);
	}, []);

	const handleInsertPageLink = useCallback(
		(page: PageRecord) => {
			const pending = pendingPageInsertRef.current;
			if (!pending) {
				setIsPagePickerOpen(false);
				return;
			}

			pending.editor
				.chain()
				.focus()
				.deleteRange(pending.range)
				.insertContent({
					type: "pageLink",
					attrs: {
						pageId: page.pageId,
						title: page.title || UNTITLED_PAGE_TITLE,
						href: `/spaces/${data.spaceId}/pages/${page.pageId}`,
					},
				})
				.run();

			pendingPageInsertRef.current = null;
			setIsPagePickerOpen(false);
		},
		[data.spaceId],
	);

	const commands = usePageEditorCommands({
		spaceId: data.spaceId,
		pageId: data.pageId,
		onOpenPagePicker: handleOpenPagePicker,
		uploadFile,
		uploadImage,
	});
	const mentionProviders = usePageMentionProviders(data.spaceId);
	const handleQuickAction = usePageQuickActions({ spaceId: data.spaceId, pageId: data.pageId });

	const handleOpenPageLink = useCallback(
		(pageId: string, title?: string) => {
			dispatch(
				tabsActions.openTab({
					path: `/spaces/${data.spaceId}/pages/${pageId}`,
					title: title ?? UNTITLED_PAGE_TITLE,
				}),
			);
		},
		[data.spaceId, dispatch],
	);

	const handleRenamePageLink = useCallback(
		async (pageId: string, nextTitle: string) => {
			const trimmed = nextTitle.trim();
			if (!trimmed) return null;
			const updated = await documentsService.updatePageTitle({
				spaceId: data.spaceId,
				pageId,
				title: trimmed,
			});
			const title = updated?.title ?? trimmed;
			if (pageId === data.pageId) noteTitleSynced(title);
			return title;
		},
		[data.pageId, data.spaceId, noteTitleSynced],
	);

	return (
		<div className="h-full min-h-full px-14 py-8 md:py-12">
			{showEmptyPageHint ? (
				<div className="mx-auto mb-6 max-w-4xl rounded-2xl border border-base-300 border-dashed bg-base-100/70 px-4 py-3 text-base-content/70 text-sm">
					Start with a note, press `/` for commands, or drag images and files into this page.
				</div>
			) : null}
			<HotkeysProvider initiallyActiveScopes={["rich-text"]}>
				<ErrorBoundary FallbackComponent={PageEditorFallback} onError={console.error}>
					<DocumentEditor
						className="w-full"
						commands={commands}
						initialContent={initialValue}
						key={`${data.spaceId}:${data.pageId}`}
						mentionProviders={mentionProviders}
						onChange={onValueChange}
						onOpenPageLink={handleOpenPageLink}
						onQuickAction={handleQuickAction}
						onRenamePageLink={handleRenamePageLink}
						placeholder="Start writing..."
						uploadFile={uploadFile}
						uploadImage={uploadImage}
					/>
				</ErrorBoundary>
				<PageLinkPicker
					currentPageId={data.pageId}
					isOpen={isPagePickerOpen}
					onClose={handleClosePagePicker}
					onSelect={handleInsertPageLink}
					spaceId={data.spaceId}
				/>
			</HotkeysProvider>
		</div>
	);
}

Component.displayName = "SpacePage";

export { Component, loader };
