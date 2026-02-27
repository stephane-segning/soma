import { cn } from "@app/lib/cn";
import {
	type PageRecord,
	useCreatePage,
	useEnsurePageMutation,
	usePagesQuery,
	useSetPageParentsMutation,
} from "@app/queries/pages";
import {
	DndContext,
	type DragEndEvent,
	type DragMoveEvent,
	PointerSensor,
	useDraggable,
	useDroppable,
	useSensor,
	useSensors,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { PolymorphButton } from "@soma/ui/components/actions/polymorph-button";
import { motion } from "motion/react";
import type React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Move, Plus } from "react-feather";
import { Link } from "react-router";

type TreeNode = {
	page: PageRecord;
	children: TreeNode[];
};

type FlatNode = {
	id: string;
	parentId: string | null;
	depth: number;
};

type Props = {
	spaceId: string;
	activePageId?: string;
	filterTerm?: string;
	showNewButton?: boolean;
};

const MAX_TREE_DEPTH = 8;
const HORIZONTAL_INDENT_PX = 28;

function moveInArray<T>(items: T[], from: number, to: number): T[] {
	if (from === to) return items;
	const next = [...items];
	const [moved] = next.splice(from, 1);
	next.splice(to, 0, moved);
	return next;
}

function buildTree(pages: PageRecord[]): TreeNode[] {
	const nodes = new Map<string, TreeNode>();
	for (const page of pages) {
		nodes.set(page.pageId, {
			page,
			children: [],
		});
	}

	const roots: TreeNode[] = [];
	for (const page of pages) {
		const node = nodes.get(page.pageId);
		if (!node) continue;

		const primaryParentId = page.parentPageIds[0];
		if (!primaryParentId || primaryParentId === page.pageId) {
			roots.push(node);
			continue;
		}

		const parent = nodes.get(primaryParentId);
		if (!parent) {
			roots.push(node);
			continue;
		}

		parent.children.push(node);
	}

	return roots;
}

function filterTree(nodes: TreeNode[], term: string): TreeNode[] {
	if (!term.trim()) return nodes;
	const needle = term.trim().toLowerCase();

	const walk = (node: TreeNode): TreeNode | null => {
		const title = node.page.title.toLowerCase();
		const filteredChildren = node.children.map((child) => walk(child)).filter(Boolean) as TreeNode[];

		if (title.includes(needle) || filteredChildren.length > 0) {
			return {
				...node,
				children: filteredChildren,
			};
		}
		return null;
	};

	return nodes.map((node) => walk(node)).filter(Boolean) as TreeNode[];
}

function flattenVisibleTree(
	nodes: TreeNode[],
	expandedByPageId: Record<string, boolean>,
	filterActive: boolean,
	parentId: string | null = null,
	depth = 0,
): FlatNode[] {
	const flat: FlatNode[] = [];

	for (const node of nodes) {
		flat.push({
			id: node.page.pageId,
			parentId,
			depth,
		});

		const isExpanded = filterActive || (expandedByPageId[node.page.pageId] ?? true);
		if (node.children.length > 0 && isExpanded) {
			flat.push(...flattenVisibleTree(node.children, expandedByPageId, filterActive, node.page.pageId, depth + 1));
		}
	}

	return flat;
}

function PageTree({ spaceId, activePageId, filterTerm = "", showNewButton = true }: Props): React.JSX.Element | null {
	const { data, isLoading } = usePagesQuery(spaceId);
	const ensurePage = useEnsurePageMutation();
	const setPageParents = useSetPageParentsMutation();
	const { createPage } = useCreatePage(spaceId);

	const [activeDragId, setActiveDragId] = useState<string | null>(null);
	const [dragDeltaX, setDragDeltaX] = useState(0);
	const [expandedByPageId, setExpandedByPageId] = useState<Record<string, boolean>>({});
	const [orderedIds, setOrderedIds] = useState<string[]>([]);

	const filterActive = filterTerm.trim().length > 0;
	const pages = data ?? [];

	useEffect(() => {
		setExpandedByPageId((prev) => {
			const next: Record<string, boolean> = {};
			for (const page of pages) {
				next[page.pageId] = prev[page.pageId] ?? true;
			}
			return next;
		});
	}, [pages]);

	useEffect(() => {
		setOrderedIds((prev) => {
			const incoming = pages.map((page) => page.pageId);
			const incomingSet = new Set(incoming);
			const kept = prev.filter((id) => incomingSet.has(id));
			const keptSet = new Set(kept);
			const missing = incoming.filter((id) => !keptSet.has(id));
			return [...kept, ...missing];
		});
	}, [pages]);

	const orderRank = useMemo(() => {
		const rank = new Map<string, number>();
		orderedIds.forEach((id, index) => rank.set(id, index));
		return rank;
	}, [orderedIds]);

	const orderedPages = useMemo(() => {
		const fallbackBase = orderRank.size + 10_000;
		return [...pages].sort((left, right) => {
			const leftRank = orderRank.get(left.pageId) ?? fallbackBase + left.createdAtMs;
			const rightRank = orderRank.get(right.pageId) ?? fallbackBase + right.createdAtMs;
			return leftRank - rightRank;
		});
	}, [orderRank, pages]);

	const tree = useMemo(() => buildTree(orderedPages), [orderedPages]);
	const filteredTree = useMemo(() => filterTree(tree, filterTerm), [filterTerm, tree]);
	const flatVisible = useMemo(
		() => flattenVisibleTree(filteredTree, expandedByPageId, filterActive),
		[expandedByPageId, filterActive, filteredTree],
	);
	const flatVisibleById = useMemo(() => {
		const map = new Map<string, FlatNode>();
		for (const item of flatVisible) map.set(item.id, item);
		return map;
	}, [flatVisible]);
	const parentById = useMemo(() => {
		const map = new Map<string, string | null>();
		for (const page of orderedPages) {
			map.set(page.pageId, page.parentPageIds[0] ?? null);
		}
		return map;
	}, [orderedPages]);

	const sensors = useSensors(
		useSensor(PointerSensor, {
			activationConstraint: {
				distance: 4,
			},
		}),
	);

	const isDescendantOf = useCallback(
		(targetId: string, ancestorId: string, seen: Set<string> = new Set()): boolean => {
			if (targetId === ancestorId) return true;
			if (seen.has(targetId)) return false;
			seen.add(targetId);
			const parentId = parentById.get(targetId);
			if (!parentId) return false;
			return isDescendantOf(parentId, ancestorId, seen);
		},
		[parentById],
	);

	const handleToggleExpanded = useCallback((pageId: string) => {
		setExpandedByPageId((prev) => ({
			...prev,
			[pageId]: !(prev[pageId] ?? true),
		}));
	}, []);

	const handleCreateChild = useCallback(
		async (pageId: string) => {
			setExpandedByPageId((prev) => ({
				...prev,
				[pageId]: true,
			}));
			await createPage([pageId]);
		},
		[createPage],
	);

	const handleDragMove = useCallback((event: DragMoveEvent) => {
		setDragDeltaX(event.delta.x);
	}, []);

	const handleDragEnd = useCallback(
		(event: DragEndEvent) => {
			setActiveDragId(null);
			setDragDeltaX(0);

			const activeId = String(event.active.id);
			const overId = event.over?.id ? String(event.over.id) : null;
			if (!spaceId || !overId) return;

				if (!flatVisibleById.has(activeId)) return;

			const currentParentId = parentById.get(activeId) ?? null;
			let nextParentId = currentParentId;

			if (overId !== "__root") {
				const overFlat = flatVisibleById.get(overId);
				if (!overFlat) return;

				if (Math.abs(event.delta.x) < HORIZONTAL_INDENT_PX) {
					if (currentParentId === overFlat.parentId) {
						const activeGlobalIndex = orderedIds.indexOf(activeId);
						const overGlobalIndex = orderedIds.indexOf(overId);
						if (activeGlobalIndex >= 0 && overGlobalIndex >= 0 && activeGlobalIndex !== overGlobalIndex) {
							setOrderedIds((prev) => moveInArray(prev, activeGlobalIndex, overGlobalIndex));
						}
					}
				}
			}

			if (event.delta.x > HORIZONTAL_INDENT_PX) {
				const overIndex = overId === "__root" ? flatVisible.length - 1 : flatVisible.findIndex((item) => item.id === overId);
				const activeIndex = flatVisible.findIndex((item) => item.id === activeId);
				if (overIndex >= 0 && activeIndex >= 0) {
					const moved = moveInArray(flatVisible.map((item) => item.id), activeIndex, overIndex);
					const movedIndex = moved.indexOf(activeId);
					const candidateParentId = movedIndex > 0 ? moved[movedIndex - 1] : null;
					if (candidateParentId && !isDescendantOf(candidateParentId, activeId)) {
						nextParentId = candidateParentId;
					}
				}
			} else if (event.delta.x < -HORIZONTAL_INDENT_PX) {
				if (currentParentId) {
					nextParentId = parentById.get(currentParentId) ?? null;
				} else {
					nextParentId = null;
				}
			} else if (overId === "__root") {
				nextParentId = null;
			}

			if (nextParentId === activeId || (nextParentId && isDescendantOf(nextParentId, activeId))) {
				return;
			}

			if (nextParentId !== currentParentId) {
				if (nextParentId) {
					setExpandedByPageId((prev) => ({
						...prev,
						[nextParentId]: true,
					}));
				}
				void setPageParents.mutateAsync({
					spaceId,
					pageId: activeId,
					parentPageIds: nextParentId ? [nextParentId] : [],
				});
			}
		},
		[flatVisible, flatVisibleById, isDescendantOf, orderedIds, parentById, setPageParents, spaceId],
	);

	if (!spaceId) return null;

	return (
		<DndContext
			onDragEnd={handleDragEnd}
			onDragMove={handleDragMove}
			onDragStart={(event) => setActiveDragId(String(event.active.id))}
			sensors={sensors}
		>
			<div className="space-y-2">
				{showNewButton ? (
					<div>
						<PolymorphButton disabled={ensurePage.isPending} onClick={() => createPage([])} variant="primary">
							<Plus className="size-4" />
						</PolymorphButton>
					</div>
				) : null}

				<PageTreeList
					activeDragId={activeDragId}
					activePageId={activePageId}
					dragDeltaX={dragDeltaX}
					expandedByPageId={expandedByPageId}
					filterActive={filterActive}
					isCreating={ensurePage.isPending}
					isLoading={isLoading}
					onCreateChild={handleCreateChild}
					onToggleExpanded={handleToggleExpanded}
					spaceId={spaceId}
					tree={filteredTree}
				/>
			</div>
		</DndContext>
	);
}

function PageTreeList({
	tree,
	spaceId,
	activePageId,
	dragDeltaX,
	onToggleExpanded,
	expandedByPageId,
	onCreateChild,
	isCreating,
	isLoading,
	activeDragId,
	filterActive,
}: {
	tree: TreeNode[];
	spaceId: string;
	activePageId?: string;
	dragDeltaX: number;
	onToggleExpanded: (pageId: string) => void;
	expandedByPageId: Record<string, boolean>;
	onCreateChild: (pageId: string) => Promise<void>;
	isCreating: boolean;
	isLoading: boolean;
	activeDragId: string | null;
	filterActive: boolean;
}): React.JSX.Element {
	const { isOver, setNodeRef } = useDroppable({
		id: "__root",
	});

	return (
		<ul
			className={cn("w-full list-none pl-0", isOver && "rounded-md outline outline-1 outline-primary/40")}
			ref={setNodeRef}
		>
			{isLoading && (
				<li className="px-2 py-1.5">
					<div className="skeleton h-6 w-full" />
				</li>
			)}
			{tree.map((node) => (
				<TreeItem
					activeDragId={activeDragId}
					activePageId={activePageId}
					dragDeltaX={dragDeltaX}
					expandedByPageId={expandedByPageId}
					filterActive={filterActive}
					isCreating={isCreating}
					key={node.page.pageId}
					node={node}
					onCreateChild={onCreateChild}
					onToggleExpanded={onToggleExpanded}
					spaceId={spaceId}
				/>
			))}
			{!isLoading && tree.length === 0 ? <li className="px-2 py-1.5 text-base-content/60 text-xs">No pages yet</li> : null}
		</ul>
	);
}

function TreeItem({
	node,
	spaceId,
	activePageId,
	dragDeltaX,
	onToggleExpanded,
	expandedByPageId,
	onCreateChild,
	isCreating,
	activeDragId,
	filterActive,
	depth = 0,
}: {
	node: TreeNode;
	spaceId: string;
	activePageId?: string;
	dragDeltaX: number;
	onToggleExpanded: (pageId: string) => void;
	expandedByPageId: Record<string, boolean>;
	onCreateChild: (pageId: string) => Promise<void>;
	isCreating: boolean;
	activeDragId: string | null;
	filterActive: boolean;
	depth?: number;
}): React.JSX.Element {
	if (depth > MAX_TREE_DEPTH) {
		return (
			<li className="text-warning text-xs">
				<Link to={`/spaces/${spaceId}/pages/${node.page.pageId}`}>Loop detected...</Link>
			</li>
		);
	}

	const hasChildren = node.children.length > 0;
	const isExpanded = hasChildren ? filterActive || (expandedByPageId[node.page.pageId] ?? true) : false;
	const isActive = node.page.pageId === activePageId;
	const isDragging = activeDragId === node.page.pageId;

	const draggable = useDraggable({ id: node.page.pageId });
	const { attributes, listeners, setNodeRef: setDragRef, transform } = draggable;
	const transition = (
		draggable as {
			transition?: string;
		}
	).transition;
	const { isOver, setNodeRef: setDropRef } = useDroppable({
		id: node.page.pageId,
	});

	const setRefs = useCallback(
		(element: HTMLElement | null) => {
			setDragRef(element);
			setDropRef(element);
		},
		[setDragRef, setDropRef],
	);

	const style = {
		transform: CSS.Translate.toString(transform),
		transition,
		opacity: isDragging ? 0.52 : 1,
	};

	const expandButton = hasChildren ? (
		<button
			aria-label={isExpanded ? "Collapse children" : "Expand children"}
			className="btn btn-ghost btn-xs btn-circle shrink-0"
			onClick={(event) => {
				event.preventDefault();
				event.stopPropagation();
				onToggleExpanded(node.page.pageId);
			}}
			type="button"
		>
			{isExpanded ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
		</button>
	) : (
		<span className="inline-block w-6 shrink-0" />
	);

	const dragHandle = (
		<button
			aria-label="Reorder page"
			className="btn btn-ghost btn-xs btn-circle shrink-0 cursor-grab opacity-0 transition-opacity focus-visible:opacity-100 active:cursor-grabbing group-hover:opacity-100"
			onClick={(event) => {
				event.preventDefault();
				event.stopPropagation();
			}}
			type="button"
			{...attributes}
			{...listeners}
		>
			<Move className="size-3.5" />
		</button>
	);

	const indentHint = isDragging && dragDeltaX > HORIZONTAL_INDENT_PX ? "ring-1 ring-primary/40" : "";
	const outdentHint = isDragging && dragDeltaX < -HORIZONTAL_INDENT_PX ? "ring-1 ring-warning/40" : "";

	return (
		<motion.li className="space-y-0" layout transition={{ type: "spring", stiffness: 460, damping: 38 }}>
			<motion.div
				className={cn(
					"group flex items-center gap-2 rounded-md px-0 py-0 transition-colors duration-150",
					isOver && "bg-primary/10",
					isActive && "bg-base-200/70",
					indentHint,
					outdentHint,
				)}
				layout
				ref={setRefs}
				style={style}
				transition={{ type: "spring", stiffness: 460, damping: 38 }}
			>
				{expandButton}

				<Link
					className={cn("min-w-0 flex-1 truncate text-sm", isActive && "text-primary")}
					onClick={(event) => {
						if (activeDragId) event.preventDefault();
					}}
					to={`/spaces/${spaceId}/pages/${node.page.pageId}`}
				>
					<span className="truncate">{node.page.title || "Untitled"}</span>
				</Link>

				<div className="flex items-center gap-1">
					{hasChildren ? (
						<button
							aria-label="Create child page"
							className="btn btn-ghost btn-xs btn-circle shrink-0 opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
							disabled={isCreating}
							onClick={(event) => {
								event.preventDefault();
								event.stopPropagation();
								void onCreateChild(node.page.pageId);
							}}
							onPointerDown={(event) => event.stopPropagation()}
							type="button"
						>
							<Plus className="size-3.5" />
						</button>
					) : null}

					{dragHandle}
				</div>
			</motion.div>

			{hasChildren && isExpanded ? (
				<motion.ul
					className="ml-5 list-none space-y-0 border-base-300/50 border-l pl-0"
					layout
					transition={{ type: "spring", stiffness: 420, damping: 36 }}
				>
					{node.children.map((child) => (
						<TreeItem
							activeDragId={activeDragId}
							activePageId={activePageId}
							depth={depth + 1}
							dragDeltaX={dragDeltaX}
							expandedByPageId={expandedByPageId}
							filterActive={filterActive}
							isCreating={isCreating}
							key={child.page.pageId}
							node={child}
							onCreateChild={onCreateChild}
							onToggleExpanded={onToggleExpanded}
							spaceId={spaceId}
						/>
					))}
				</motion.ul>
			) : null}
		</motion.li>
	);
}

export { PageTree };
