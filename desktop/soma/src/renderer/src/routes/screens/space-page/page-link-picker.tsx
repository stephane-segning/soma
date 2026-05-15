import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { UNTITLED_PAGE_TITLE } from "../page-title";
import * as documentsService from "../../../services/documents-service";
import type { PageRecord } from "./types";

type PageLinkPickerProps = {
	currentPageId: string;
	isOpen: boolean;
	onClose: () => void;
	onSelect: (page: PageRecord) => void;
	spaceId: string;
};

export function PageLinkPicker({
	currentPageId,
	isOpen,
	onClose,
	onSelect,
	spaceId,
}: PageLinkPickerProps): React.JSX.Element | null {
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
				setPages(result.filter((page) => page.pageId !== currentPageId));
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
		(event: KeyboardEvent<HTMLInputElement>) => {
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
					<PageLinkPickerList
						activeIndex={activeIndex}
						loading={loading}
						onSelect={onSelect}
						pages={filteredPages}
					/>
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

function PageLinkPickerList({
	activeIndex,
	loading,
	onSelect,
	pages,
}: {
	activeIndex: number;
	loading: boolean;
	onSelect: (page: PageRecord) => void;
	pages: PageRecord[];
}): React.JSX.Element {
	if (loading) {
		return <div className="px-3 py-2 text-base-content/60 text-sm">Loading pages...</div>;
	}

	if (pages.length === 0) {
		return <div className="px-3 py-2 text-base-content/60 text-sm">No pages found.</div>;
	}

	return (
		<>
			{pages.map((page, index) => (
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
			))}
		</>
	);
}
