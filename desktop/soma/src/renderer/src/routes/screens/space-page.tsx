import { uploadToBlob } from "@app/lib/blob";
import { useAppDispatch } from "@app/store/hooks";
import { tabsActions } from "@app/store/tabs";
import {
	DocumentEditor,
	defaultCommands,
	type EditorCommand,
	type JSONContent,
	type MentionProvider,
} from "@soma/editor";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ErrorBoundary, type FallbackProps } from "react-error-boundary";
import { HotkeysProvider } from "react-hotkeys-hook";
import { type LoaderFunctionArgs, useLoaderData } from "react-router";
import {
	deriveTitleFromDocument,
	isDocumentEffectivelyEmpty,
	normalizePageTitle,
	shouldSyncDerivedTitle,
	UNTITLED_PAGE_TITLE,
} from "./page-title";
import * as chatService from "../../services/chat-service";
import * as documentsService from "../../services/documents-service";
import * as spacesService from "../../services/spaces-service";

type LoaderData = {
	spaceId: string;
	pageId: string;
	pageTitle: string;
	initialContentJson: string | null;
};

type PageRecord = {
	spaceId: string;
	pageId: string;
	title: string;
	parentPageIds: string[];
	createdAtMs: number;
	updatedAtMs: number;
};

type EditorLike = Parameters<EditorCommand["handler"]>[0]["editor"];

type PendingPageInsert = {
	editor: EditorLike;
	range: {
		from: number;
		to: number;
	};
};

function PageEditorFallback({ error, resetErrorBoundary }: FallbackProps): React.JSX.Element {
	const detail = error instanceof Error ? error.message : String(error);
	return (
		<div className="mx-auto my-8 w-full max-w-4xl rounded-2xl border border-error/30 bg-base-100 p-6 shadow-lg">
			<h2 className="font-semibold text-lg">Editor crashed</h2>
			<p className="mt-2 text-base-content/70 text-sm">{detail}</p>
			<div className="mt-4 flex items-center gap-2">
				<button className="btn btn-error btn-sm" onClick={resetErrorBoundary} type="button">
					Retry editor
				</button>
				<button className="btn btn-ghost btn-sm" onClick={() => globalThis.location.reload()} type="button">
					Reload page
				</button>
			</div>
		</div>
	);
}

function parseContent(contentJson: string | null): JSONContent | undefined {
	if (!contentJson) return undefined;
	try {
		const parsed = JSON.parse(contentJson) as JSONContent | null;
		return parsed ?? undefined;
	} catch {
		return undefined;
	}
}

async function loader({ params }: LoaderFunctionArgs): Promise<LoaderData> {
	const spaceId = params.spaceId ?? "";
	const pageId = params.pageId ?? "";
	if (!spaceId || !pageId) {
		throw new Response("Missing space or page", {
			status: 400,
		});
	}

	const pages = await documentsService.listPages({ spaceId });
	const page = pages.find((candidate) => candidate.pageId === pageId);
	if (!page) {
		throw new Response("Page not found", {
			status: 404,
		});
	}

	const draft = await documentsService.getDraft({
		spaceId,
		documentId: pageId,
	});

	return {
		spaceId,
		pageId,
		pageTitle: normalizePageTitle(page.title),
		initialContentJson: draft?.contentJson ?? null,
	};
}

function Component(): React.JSX.Element {
	const data = useLoaderData<LoaderData>();
	const dispatch = useAppDispatch();

	const initialValue = useMemo(() => parseContent(data.initialContentJson), [data.initialContentJson]);
	const showEmptyPageHint = useMemo(() => isDocumentEffectivelyEmpty(initialValue), [initialValue]);

	const latestValueRef = useRef<JSONContent | undefined>(initialValue);
	const dirtyRef = useRef(false);
	const savingRef = useRef(false);
	const autosaveTimerRef = useRef<number | null>(null);
	const pendingPageInsertRef = useRef<PendingPageInsert | null>(null);
	const syncedTitleRef = useRef<string | null>(null);
	const currentPageTitleRef = useRef<string>(data.pageTitle);

	const [isPagePickerOpen, setIsPagePickerOpen] = useState(false);

	useEffect(() => {
		latestValueRef.current = initialValue;
		dirtyRef.current = false;
		if (autosaveTimerRef.current) {
			window.clearTimeout(autosaveTimerRef.current);
			autosaveTimerRef.current = null;
		}
		currentPageTitleRef.current = data.pageTitle;
		syncedTitleRef.current = null;
	}, [data.pageTitle, initialValue]);

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
						spaceId: data.spaceId,
						pageId: data.pageId,
						title: nextTitle,
					});
					if (updated?.title) {
						syncedTitleRef.current = updated.title;
						currentPageTitleRef.current = normalizePageTitle(updated.title);
					}
				}

				const contentJson = JSON.stringify(latestValue ?? null);
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

	const handleValueChange = useCallback(
		(value: JSONContent) => {
			latestValueRef.current = value;
			dirtyRef.current = true;
			scheduleAutosave();
		},
		[scheduleAutosave],
	);

	const pickFiles = useCallback(
		(options: { accept?: string; multiple?: boolean }) =>
			new Promise<File[]>((resolve) => {
				const input = document.createElement("input");
				input.type = "file";
				input.accept = options.accept ?? "";
				input.multiple = options.multiple ?? false;
				input.onchange = () => {
					const files = input.files ? Array.from(input.files) : [];
					resolve(files);
					input.remove();
				};
				input.click();
			}),
		[],
	);

	const handleOpenPagePicker = useCallback((editor: EditorLike, range: { from: number; to: number }) => {
		pendingPageInsertRef.current = { editor, range };
		setIsPagePickerOpen(true);
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

	const handleClosePagePicker = useCallback(() => {
		pendingPageInsertRef.current = null;
		setIsPagePickerOpen(false);
	}, []);

	const commands = useMemo<EditorCommand[]>(() => {
		const base = [...defaultCommands];
		base.push({
			key: "new-sub-page",
			name: "New sub-page",
			description: "Create a nested page and insert a link",
			keywords: ["page", "subpage", "nested"],
				handler: async ({ editor, range }) => {
					const created = await documentsService.ensurePage({
						spaceId: data.spaceId,
						title: UNTITLED_PAGE_TITLE,
						parentPageIds: [data.pageId],
					});

				editor
					.chain()
					.focus()
					.deleteRange(range)
					.insertContent({
						type: "pageLink",
						attrs: {
							pageId: created.pageId,
							title: created.title || UNTITLED_PAGE_TITLE,
							href: `/spaces/${data.spaceId}/pages/${created.pageId}`,
						},
					})
					.run();
			},
		});
		base.push({
			key: "insert-image",
			name: "Image",
			description: "Insert an image from disk",
			keywords: ["image", "photo", "picture"],
			handler: async ({ editor, range }) => {
				const files = await pickFiles({ accept: "image/*", multiple: true });
				if (files.length === 0) return;

				editor.chain().focus().deleteRange(range).run();

				for (const file of files) {
					if (!file.type.startsWith("image/")) continue;
					const staged = await uploadToBlob(file, "image", {
						spaceId: data.spaceId,
						docId: data.pageId,
					});
					const sources =
						staged.variants && staged.variants.length > 0
							? [
									{
										src: staged.url,
										alt: staged.name,
										width: staged.width,
										height: staged.height,
									},
									...staged.variants.map((variant) => ({
										src: variant.url,
										alt: variant.name,
										width: variant.width,
										height: variant.height,
									})),
								]
							: null;

					editor
						.chain()
						.focus()
						.insertContent({
							type: "blobImage",
							attrs: {
								cid: staged.asset_id,
								src: staged.url,
								sources,
								mime: staged.format,
								size: staged.bytes,
								name: staged.name,
								width: staged.width,
								height: staged.height,
							},
						})
						.run();
				}
			},
		});
		base.push({
			key: "insert-file",
			name: "File",
			description: "Insert a file from disk",
			keywords: ["file", "attachment", "upload"],
			handler: async ({ editor, range }) => {
				const files = await pickFiles({ multiple: true });
				if (files.length === 0) return;

				editor.chain().focus().deleteRange(range).run();

				for (const file of files) {
					const staged = await uploadToBlob(file, "file", {
						spaceId: data.spaceId,
						docId: data.pageId,
					});

					editor
						.chain()
						.focus()
						.insertContent({
							type: "blobFile",
							attrs: {
								cid: staged.asset_id,
								href: staged.url,
								mime: staged.format,
								size: staged.bytes,
								name: staged.name,
							},
						})
						.run();
				}
			},
		});
		base.push({
			key: "link-to-page",
			name: "Link to page",
			description: "Insert a link to an existing page",
			keywords: ["page", "link", "reference"],
			handler: async ({ editor, range }) => {
				handleOpenPagePicker(editor, { from: range.from, to: range.to });
			},
		});

		return base;
	}, [data.pageId, data.spaceId, handleOpenPagePicker, pickFiles]);

	const uploadImage = useCallback(
		async (file: File) => {
			const staged = await uploadToBlob(file, "image", {
				spaceId: data.spaceId,
				docId: data.pageId,
			});

			const sources =
				staged.variants && staged.variants.length > 0
					? [
							{
								src: staged.url,
								alt: staged.name,
								width: staged.width,
								height: staged.height,
							},
							...staged.variants.map((variant) => ({
								src: variant.url,
								alt: variant.name,
								width: variant.width,
								height: variant.height,
							})),
						]
					: null;

			return {
				cid: staged.asset_id,
				src: staged.url,
				sources,
				mime: staged.format,
				size: staged.bytes,
				name: staged.name,
				width: staged.width,
				height: staged.height,
			};
		},
		[data.pageId, data.spaceId],
	);

	const uploadFile = useCallback(
		async (file: File) => {
			const staged = await uploadToBlob(file, "file", {
				spaceId: data.spaceId,
				docId: data.pageId,
			});

			return {
				cid: staged.asset_id,
				href: staged.url,
				mime: staged.format,
				size: staged.bytes,
				name: staged.name,
			};
		},
		[data.pageId, data.spaceId],
	);

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
			if (pageId === data.pageId) {
				currentPageTitleRef.current = normalizePageTitle(updated?.title ?? trimmed);
				syncedTitleRef.current = updated?.title ?? trimmed;
			}
			return updated?.title ?? trimmed;
		},
		[data.pageId, data.spaceId],
	);

	const mentionProviders = useMemo<MentionProvider[]>(() => {
		const peerMention: MentionProvider = {
			name: "peerMention",
			char: "@",
			placeholder: "Mention a peer",
			items: async (query) => {
				const members = await spacesService.listSpaceMembers(data.spaceId);
				const trimmed = query.trim().toLowerCase();
				return members
					.filter((member) => (trimmed ? member.peerId.toLowerCase().includes(trimmed) : true))
					.map((member) => ({
						id: member.peerId,
						label: member.peerId,
						detail: member.role,
						href: `/spaces/${data.spaceId}/members?peerId=${member.peerId}`,
					}));
			},
		};

		const spaceMention: MentionProvider = {
			name: "spaceMention",
			char: "%",
			placeholder: "Mention a space",
			items: async (query) => {
				const result = await spacesService.listSpaces({ query });
				return result.spaces.map((space) => ({
					id: space.spaceId,
					label: space.displayName || space.spaceId,
					detail: space.spaceId,
					href: `/spaces/${space.spaceId}`,
				}));
			},
		};

		const pageMention: MentionProvider = {
			name: "pageMention",
			char: "#",
			placeholder: "Mention a page",
			items: async (query) => {
				const pages = await documentsService.listPages({ spaceId: data.spaceId });
				const trimmed = query.trim().toLowerCase();
				return pages
					.filter((page) => {
						if (!trimmed) return true;
						const title = (page.title ?? "").toLowerCase();
						return title.includes(trimmed) || page.pageId.toLowerCase().includes(trimmed);
					})
					.map((page) => ({
						id: page.pageId,
						label: page.title || UNTITLED_PAGE_TITLE,
						detail: page.pageId,
						href: `/spaces/${data.spaceId}/pages/${page.pageId}`,
					}));
			},
		};

		return [peerMention, spaceMention, pageMention];
	}, [data.spaceId]);

	const handleQuickAction = useCallback(
		async ({ action, selectionText }: { action: "explain" | "expand" | "research"; selectionText: string }) => {
			if (action === "explain") {
				const content = await chatService.runExplainSelection(selectionText, {
					spaceId: data.spaceId,
				});
				return {
					status: "done" as const,
					content,
				};
			}

			if (action === "expand") {
				const content = await chatService.runExpandSelection(selectionText, {
					spaceId: data.spaceId,
				});
				return {
					status: "done" as const,
					content,
				};
			}

			await chatService.enqueueBackgroundTask({
				kind: "research-selection",
				spaceId: data.spaceId,
				documentId: data.pageId,
				selectionText,
				persistInDocument: false,
			});

			return {
				status: "queued" as const,
				message: "Research task queued in agentd.",
			};
		},
		[data.pageId, data.spaceId],
	);

	return (
		<div className="h-full min-h-full px-14 py-8 md:py-12">
			{showEmptyPageHint ? (
				<div className="mx-auto mb-6 max-w-4xl rounded-2xl border border-dashed border-base-300 bg-base-100/70 px-4 py-3 text-sm text-base-content/70">
					Start with a note, press `/` for commands, or drag images and files directly into the page.
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
						onChange={handleValueChange}
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

export { Component, loader };

function PageLinkPicker({
	currentPageId,
	isOpen,
	onClose,
	onSelect,
	spaceId,
}: {
	currentPageId: string;
	isOpen: boolean;
	onClose: () => void;
	onSelect: (page: PageRecord) => void;
	spaceId: string;
}): React.JSX.Element | null {
	const [query, setQuery] = useState("");
	const [pages, setPages] = useState<PageRecord[]>([]);
	const [loading, setLoading] = useState(false);
	const [activeIndex, setActiveIndex] = useState(0);
	const inputRef = useRef<HTMLInputElement | null>(null);

	useEffect(() => {
		if (!isOpen) return;

		let active = true;
		setLoading(true);
		setQuery("");
		setActiveIndex(0);

		void documentsService
			.listPages({ spaceId })
			.then((result) => {
				if (!active) return;
				const filtered = result.filter((page) => page.pageId !== currentPageId);
				setPages(filtered);
			})
			.finally(() => {
				if (!active) return;
				setLoading(false);
			});

		return () => {
			active = false;
		};
	}, [currentPageId, isOpen, spaceId]);

	const filteredPages = useMemo(() => {
		if (!query.trim()) return pages;
		const search = query.trim().toLowerCase();
		return pages.filter((page) => {
			const title = page.title?.toLowerCase() ?? "";
			return title.includes(search) || page.pageId.toLowerCase().includes(search);
		});
	}, [pages, query]);

	useEffect(() => {
		if (!isOpen) return;
		inputRef.current?.focus();
	}, [isOpen]);

	const handleKeyDown = useCallback(
		(event: React.KeyboardEvent<HTMLInputElement>) => {
			if (event.key === "Escape") {
				event.preventDefault();
				onClose();
				return;
			}

			if (event.key === "ArrowDown") {
				event.preventDefault();
				setActiveIndex((prev) => (prev + 1) % Math.max(filteredPages.length, 1));
				return;
			}

			if (event.key === "ArrowUp") {
				event.preventDefault();
				setActiveIndex((prev) => (prev + filteredPages.length - 1) % Math.max(filteredPages.length, 1));
				return;
			}

			if (event.key === "Enter") {
				event.preventDefault();
				const selected = filteredPages[activeIndex];
				if (selected) onSelect(selected);
			}
		},
		[activeIndex, filteredPages, onClose, onSelect],
	);

	if (!isOpen) return null;

	return (
		<div className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 pt-24">
			<div className="w-[520px] max-w-[90vw] overflow-hidden rounded-2xl border border-base-300 bg-base-100 shadow-2xl">
				<div className="border-base-200 border-b px-4 py-3">
					<input
						className="input input-bordered w-full"
						onChange={(event) => {
							setQuery(event.target.value);
							setActiveIndex(0);
						}}
						onKeyDown={handleKeyDown}
						placeholder="Search pages..."
						ref={inputRef}
						value={query}
					/>
				</div>
				<div className="max-h-80 overflow-y-auto p-2">
					{loading ? (
						<div className="px-3 py-2 text-base-content/60 text-sm">Loading pages…</div>
					) : filteredPages.length === 0 ? (
						<div className="px-3 py-2 text-base-content/60 text-sm">No pages found.</div>
					) : (
						filteredPages.map((page, index) => (
							<button
								className={[
									"flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm",
									index === activeIndex ? "bg-base-200" : "hover:bg-base-200/60",
								].join(" ")}
								key={page.pageId}
								onClick={() => onSelect(page)}
								type="button"
							>
							<span className="truncate font-medium">{page.title || UNTITLED_PAGE_TITLE}</span>
								<span className="shrink-0 text-base-content/50 text-xs">{page.pageId}</span>
							</button>
						))
					)}
				</div>
				<div className="flex items-center justify-end gap-2 border-base-200 border-t px-3 py-2">
					<button className="btn btn-ghost btn-sm" onClick={onClose} type="button">
						Close
					</button>
				</div>
			</div>
		</div>
	);
}
