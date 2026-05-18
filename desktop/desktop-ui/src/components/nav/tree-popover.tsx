/**
 * TreePopover — document-tree picker anchored under the breadcrumb
 * in the document column header.
 *
 * Locked by [ADR-0005 §12](../../../../../docs/src/architecture/adrs/0005-ui-revamp-v0.md)
 * and [refs space-lifecycle §3](../../../../../docs/src/architecture/prd/ui-revamp-v0-refs-space-lifecycle.md).
 *
 * Sections in fixed order:
 *   1. Search input at top
 *   2. Recent (most recently opened docs in this space)
 *   3. Starred (if any)
 *   4. All pages — collapsible tree via `react-complex-tree`
 *   5. Footer chip-strip teaching keyboard shortcuts
 *
 * The tree itself is built on [`react-complex-tree`](https://www.npmjs.com/package/react-complex-tree)
 * (locked in ADR §12) so we inherit keyboard nav, drag-and-drop, and
 * virtualization for large trees without reimplementing them.
 *
 * Positioning is the caller's job — the breadcrumb wires it into its
 * own floating surface.
 */
import {
	InteractionMode,
	StaticTreeDataProvider,
	type TreeItem,
	Tree,
	UncontrolledTreeEnvironment,
} from "react-complex-tree";
import "react-complex-tree/lib/style-modern.css";
import { ChevronRight, FileText, Search, Star } from "react-feather";
import { type ReactNode, useMemo, useRef, useState } from "react";
import { useT } from "../../i18n/use-t";
import { cn } from "../../utils/cn";

export type TreeDoc = {
	id: string;
	title: string;
	parentId?: string | null;
	starred?: boolean;
};

export type TreePopoverProps = {
	/** Flat list of every document in the current space. */
	documents: TreeDoc[];
	/** Document ids in most-recent-first order. Capped to ~5 for display. */
	recentIds?: string[];
	/** Currently open document — highlighted in the tree if present. */
	currentId?: string | null;
	onSelect: (id: string) => void;
	/** Triggered by ⌘↵ on the highlighted row in the tree. */
	onSelectInNewTab?: (id: string) => void;
	onClose: () => void;
	className?: string;
};

const ROOT_ID = "__tree-root__";

export function TreePopover({
	documents,
	recentIds = [],
	currentId,
	onSelect,
	onSelectInNewTab,
	onClose,
	className,
}: TreePopoverProps) {
	const t = useT();
	const [query, setQuery] = useState("");
	const containerRef = useRef<HTMLDivElement | null>(null);

	const byId = useMemo(() => {
		const map = new Map<string, TreeDoc>();
		for (const doc of documents) map.set(doc.id, doc);
		return map;
	}, [documents]);

	const recents = useMemo(
		() =>
			recentIds
				.map((id) => byId.get(id))
				.filter((doc): doc is TreeDoc => Boolean(doc))
				.slice(0, 5),
		[recentIds, byId],
	);

	const starred = useMemo(
		() => documents.filter((doc) => doc.starred),
		[documents],
	);

	// react-complex-tree expects an object keyed by item id with a
	// `children` array of child ids. Root carries the top-level children.
	const treeItems = useMemo(() => {
		const childrenByParent = new Map<string, string[]>();
		for (const doc of documents) {
			const parent = doc.parentId ?? ROOT_ID;
			const arr = childrenByParent.get(parent) ?? [];
			arr.push(doc.id);
			childrenByParent.set(parent, arr);
		}
		const items: Record<string, TreeItem<TreeDoc>> = {
			[ROOT_ID]: {
				index: ROOT_ID,
				isFolder: true,
				children: childrenByParent.get(ROOT_ID) ?? [],
				data: { id: ROOT_ID, title: "Pages" },
				canMove: false,
				canRename: false,
			},
		};
		for (const doc of documents) {
			const children = childrenByParent.get(doc.id) ?? [];
			items[doc.id] = {
				index: doc.id,
				isFolder: children.length > 0,
				children,
				data: doc,
				canMove: true,
				canRename: false,
			};
		}
		return items;
	}, [documents]);

	// When the user is filtering, we collapse the tree section to a flat
	// list of matches so the picker stays scannable. The tree only shows
	// when the query is empty.
	const filteredDocs = useMemo(() => {
		if (query.trim().length === 0) return null;
		const lower = query.toLowerCase();
		return documents.filter((doc) => doc.title.toLowerCase().includes(lower));
	}, [query, documents]);

	const dataProvider = useMemo(
		() =>
			new StaticTreeDataProvider(
				treeItems,
				(item, newName) => ({ ...item, data: { ...item.data, title: newName } }),
			),
		[treeItems],
	);

	return (
		<div
			aria-label={t({
				id: "tree-popover.aria-label",
				defaultMessage: "Document picker",
			})}
			className={cn(
				"glass-panel shadow-elevated w-80 flex flex-col gap-2 p-2",
				className,
			)}
			ref={containerRef}
			role="dialog"
		>
			<SearchInput
				onChange={setQuery}
				placeholder={t({
					id: "tree-popover.search",
					defaultMessage: "Search this space…",
				})}
				value={query}
			/>

			{filteredDocs ? (
				<FilteredList
					docs={filteredDocs}
					onSelect={(id) => {
						onSelect(id);
						onClose();
					}}
				/>
			) : (
				<>
					{recents.length > 0 ? (
						<Section
							title={t({
								id: "tree-popover.recent",
								defaultMessage: "Recent",
							})}
						>
							{recents.map((doc) => (
								<DocRow
									active={doc.id === currentId}
									doc={doc}
									key={`recent-${doc.id}`}
									onSelect={() => {
										onSelect(doc.id);
										onClose();
									}}
								/>
							))}
						</Section>
					) : null}

					{starred.length > 0 ? (
						<Section
							title={t({
								id: "tree-popover.starred",
								defaultMessage: "Starred",
							})}
						>
							{starred.map((doc) => (
								<DocRow
									active={doc.id === currentId}
									doc={doc}
									key={`starred-${doc.id}`}
									onSelect={() => {
										onSelect(doc.id);
										onClose();
									}}
									showStar
								/>
							))}
						</Section>
					) : null}

					<Section
						title={t({
							id: "tree-popover.all",
							defaultMessage: "All pages",
						})}
					>
						<div className="rct-soma-wrapper max-h-72 overflow-y-auto">
							<UncontrolledTreeEnvironment
								canDragAndDrop={false}
								canDropOnFolder
								canReorderItems={false}
								dataProvider={dataProvider}
								defaultInteractionMode={InteractionMode.ClickArrowToExpand}
								getItemTitle={(item) => item.data.title}
								onPrimaryAction={(item, _treeId) => {
									if (typeof item.index !== "string") return;
									if (item.index === ROOT_ID) return;
									onSelect(item.index);
									onClose();
								}}
								renderItemArrow={({ item, context }) =>
									item.isFolder ? (
										<ChevronRight
											aria-hidden
											className={cn(
												"size-3 shrink-0 text-base-content/40 transition-transform",
												context.isExpanded && "rotate-90",
											)}
										/>
									) : (
										<span aria-hidden className="size-3 shrink-0" />
									)
								}
								renderItemTitle={({ title, item }) => (
									<span className="flex min-w-0 items-center gap-1.5">
										<FileText
											aria-hidden
											className="size-3.5 shrink-0 text-base-content/60"
										/>
										<span
											className={cn(
												"truncate text-ui-sm",
												item.data.id === currentId
													? "text-primary"
													: "text-base-content/90",
											)}
										>
											{title}
										</span>
									</span>
								)}
								viewState={{
									"soma-tree": {
										expandedItems: [],
										selectedItems: currentId ? [currentId] : [],
									},
								}}
							>
								<Tree
									rootItem={ROOT_ID}
									treeId="soma-tree"
									treeLabel={t({
										id: "tree-popover.tree-label",
										defaultMessage: "All pages",
									})}
								/>
							</UncontrolledTreeEnvironment>
						</div>
					</Section>
				</>
			)}

			<KeyboardHintsFooter
				onSelectInNewTab={onSelectInNewTab !== undefined}
			/>
		</div>
	);
}

function SearchInput({
	value,
	onChange,
	placeholder,
}: {
	value: string;
	onChange: (next: string) => void;
	placeholder: string;
}) {
	return (
		<div className="flex items-center gap-2 rounded-md bg-base-200 px-2 py-1.5">
			<Search aria-hidden className="size-4 shrink-0 text-base-content/60" />
			<input
				className="min-w-0 flex-1 bg-transparent text-body outline-none placeholder:text-base-content/40"
				onChange={(event) => onChange(event.target.value)}
				placeholder={placeholder}
				type="text"
				value={value}
			/>
		</div>
	);
}

function Section({ title, children }: { title: string; children: ReactNode }) {
	return (
		<div className="flex flex-col gap-0.5">
			<div className="px-2 pt-1 text-base-content/50 text-ui-xs uppercase tracking-wide">
				{title}
			</div>
			{children}
		</div>
	);
}

function DocRow({
	doc,
	active,
	onSelect,
	showStar,
}: {
	doc: TreeDoc;
	active?: boolean;
	onSelect: () => void;
	showStar?: boolean;
}) {
	return (
		<button
			aria-selected={active}
			className={cn(
				"flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-ui-sm transition-colors",
				active
					? "bg-primary/10 text-primary"
					: "hover:bg-base-200",
			)}
			onClick={onSelect}
			type="button"
		>
			<FileText
				aria-hidden
				className="size-3.5 shrink-0 text-base-content/60"
			/>
			<span className="min-w-0 flex-1 truncate">{doc.title}</span>
			{showStar ? (
				<Star
					aria-hidden
					className="size-3 shrink-0 fill-warning text-warning"
				/>
			) : null}
		</button>
	);
}

function FilteredList({
	docs,
	onSelect,
}: {
	docs: TreeDoc[];
	onSelect: (id: string) => void;
}) {
	const t = useT();
	if (docs.length === 0) {
		return (
			<div className="px-2 py-2 text-base-content/60 text-ui-sm">
				{t({
					id: "tree-popover.no-matches",
					defaultMessage: "No matches",
				})}
			</div>
		);
	}
	return (
		<div className="flex max-h-72 flex-col gap-0.5 overflow-y-auto">
			{docs.map((doc) => (
				<DocRow doc={doc} key={doc.id} onSelect={() => onSelect(doc.id)} />
			))}
		</div>
	);
}

function KeyboardHintsFooter({
	onSelectInNewTab,
}: {
	onSelectInNewTab: boolean;
}) {
	const t = useT();
	return (
		<div className="flex flex-wrap items-center gap-1 border-base-300 border-t pt-2 text-base-content/50 text-ui-xs">
			<HintChip
				keys="↑↓"
				label={t({
					id: "tree-popover.hint.nav",
					defaultMessage: "Navigate",
				})}
			/>
			<HintChip
				keys="↵"
				label={t({
					id: "tree-popover.hint.open",
					defaultMessage: "Open",
				})}
			/>
			{onSelectInNewTab ? (
				<HintChip
					keys="⌘↵"
					label={t({
						id: "tree-popover.hint.new-tab",
						defaultMessage: "Open in new tab",
					})}
				/>
			) : null}
			<HintChip
				keys="Esc"
				label={t({
					id: "tree-popover.hint.close",
					defaultMessage: "Close",
				})}
			/>
		</div>
	);
}

function HintChip({ keys, label }: { keys: string; label: string }) {
	return (
		<span className="inline-flex items-center gap-1 rounded-sm bg-base-200 px-1.5 py-0.5">
			<kbd className="font-mono text-ui-xs">{keys}</kbd>
			<span>{label}</span>
		</span>
	);
}
