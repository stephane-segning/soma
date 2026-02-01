import { DocumentEditor, type EditorCommand, type JSONContent, defaultCommands } from "@soma/editor";
import { uploadToBlob } from "@app/lib/blob";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { HotkeysProvider } from "react-hotkeys-hook";
import { type LoaderFunctionArgs, useLoaderData } from "react-router";
import { useAppDispatch } from "@app/store/hooks";
import { tabsActions } from "@app/store/tabs";
import * as documentsService from "../../services/documents-service";

type LoaderData = {
	spaceId: string;
	pageId: string;
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
	const dispatch = useAppDispatch();

	const initialValue = useMemo(() => parseContent(data.initialContentJson), [data.initialContentJson]);

	const latestValueRef = useRef<JSONContent | undefined>(initialValue);
	const dirtyRef = useRef(false);
	const savingRef = useRef(false);
	const autosaveTimerRef = useRef<number | null>(null);
	const pendingPageInsertRef = useRef<PendingPageInsert | null>(null);

	const [isPagePickerOpen, setIsPagePickerOpen] = useState(false);

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

	const handleValueChange = useCallback(
		(value: JSONContent) => {
			latestValueRef.current = value;
			dirtyRef.current = true;
			scheduleAutosave();
		},
		[scheduleAutosave],
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
						title: page.title || "Untitled",
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
					title: "Untitled",
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
							title: created.title || "Untitled",
						},
					})
					.run();
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
	}, [data.pageId, data.spaceId, handleOpenPagePicker]);

	const uploadImage = useCallback(
		async (file: File) => {
			const staged = await uploadToBlob(file, "image", {
				spaceId: data.spaceId,
				docId: data.pageId,
			});

			return {
				cid: staged.asset_id,
				src: staged.url,
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
					title: title ?? "Untitled",
				}),
			);
		},
		[data.spaceId, dispatch],
	);

	return (
		<div className="h-full min-h-full px-14">
			<HotkeysProvider initiallyActiveScopes={["rich-text"]}>
				<DocumentEditor
					className="w-full"
					initialContent={initialValue}
					key={`${data.spaceId}:${data.pageId}`}
					commands={commands}
					onChange={handleValueChange}
					onOpenPageLink={handleOpenPageLink}
					placeholder="Start writing..."
					uploadFile={uploadFile}
					uploadImage={uploadImage}
				/>
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
		setActiveIndex(0);
	}, [query, pages, isOpen]);

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
				<div className="border-b border-base-200 px-4 py-3">
					<input
						autoFocus
						className="input input-bordered w-full"
						placeholder="Search pages..."
						value={query}
						onChange={(event) => setQuery(event.target.value)}
						onKeyDown={handleKeyDown}
					/>
				</div>
				<div className="max-h-80 overflow-y-auto p-2">
					{loading ? (
						<div className="px-3 py-2 text-sm text-base-content/60">Loading pages…</div>
					) : filteredPages.length === 0 ? (
						<div className="px-3 py-2 text-sm text-base-content/60">No pages found.</div>
					) : (
						filteredPages.map((page, index) => (
							<button
								type="button"
								key={page.pageId}
								onClick={() => onSelect(page)}
								className={[
									"flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm",
									index === activeIndex ? "bg-base-200" : "hover:bg-base-200/60",
								].join(" ")}
							>
								<span className="truncate font-medium">{page.title || "Untitled"}</span>
								<span className="shrink-0 text-xs text-base-content/50">{page.pageId}</span>
							</button>
						))
					)}
				</div>
				<div className="flex items-center justify-end gap-2 border-t border-base-200 px-3 py-2">
					<button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
						Close
					</button>
				</div>
			</div>
		</div>
	);
}
