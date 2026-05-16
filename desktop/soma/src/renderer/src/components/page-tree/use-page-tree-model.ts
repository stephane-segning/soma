import { buildTree, filterTree, flattenVisibleTree, moveInArray } from "@app/components/page-tree-utils";
import { useCreatePage, useEnsurePageMutation, usePagesQuery, useSetPageParentsMutation } from "@app/queries/pages";
import { type DragEndEvent, type DragMoveEvent, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { type Dispatch, type SetStateAction, useCallback, useEffect, useMemo, useState } from "react";
import { HORIZONTAL_INDENT_PX } from "./constants";
import type { FlatNodeById, PageTreeModel } from "./types";

export function usePageTreeModel(spaceId: string, filterTerm: string): PageTreeModel {
	const { data, isLoading } = usePagesQuery(spaceId);
	const ensurePage = useEnsurePageMutation();
	const setPageParents = useSetPageParentsMutation();
	const { createPage } = useCreatePage(spaceId);
	const [activeDragId, setActiveDragId] = useState<string | null>(null);
	const [dragDeltaX, setDragDeltaX] = useState(0);
	const [expandedByPageId, setExpandedByPageId] = useState<Record<string, boolean>>({});
	const [orderedIds, setOrderedIds] = useState<string[]>([]);
	const pages = data ?? [];

	useEffect(() => {
		setExpandedByPageId((prev) => Object.fromEntries(pages.map((page) => [page.pageId, prev[page.pageId] ?? true])));
	}, [pages]);

	useEffect(() => {
		setOrderedIds((prev) => {
			const incoming = pages.map((page) => page.pageId);
			const incomingSet = new Set(incoming);
			const kept = prev.filter((id) => incomingSet.has(id));
			const keptSet = new Set(kept);
			return [...kept, ...incoming.filter((id) => !keptSet.has(id))];
		});
	}, [pages]);

	const orderedPages = useMemo(() => {
		const rank = new Map<string, number>();
		for (const [index, id] of orderedIds.entries()) {
			rank.set(id, index);
		}
		const fallbackBase = rank.size + 10_000;
		return [...pages].sort((left, right) => {
			const leftRank = rank.get(left.pageId) ?? fallbackBase + left.createdAtMs;
			const rightRank = rank.get(right.pageId) ?? fallbackBase + right.createdAtMs;
			return leftRank - rightRank;
		});
	}, [orderedIds, pages]);

	const filterActive = filterTerm.trim().length > 0;
	const tree = useMemo(() => buildTree(orderedPages), [orderedPages]);
	const filteredTree = useMemo(() => filterTree(tree, filterTerm), [filterTerm, tree]);
	const flatVisible = useMemo(
		() => flattenVisibleTree(filteredTree, expandedByPageId, filterActive),
		[expandedByPageId, filterActive, filteredTree],
	);
	const flatVisibleById = useMemo<FlatNodeById>(() => {
		const map: FlatNodeById = new Map();
		for (const item of flatVisible) map.set(item.id, item);
		return map;
	}, [flatVisible]);
	const parentById = useMemo(() => {
		const map = new Map<string, string | null>();
		for (const page of orderedPages) map.set(page.pageId, page.parentPageIds[0] ?? null);
		return map;
	}, [orderedPages]);
	const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

	const isDescendantOf = useCallback(
		(targetId: string, ancestorId: string, seen: Set<string> = new Set()): boolean => {
			if (targetId === ancestorId) return true;
			if (seen.has(targetId)) return false;
			seen.add(targetId);
			const parentId = parentById.get(targetId);
			return parentId ? isDescendantOf(parentId, ancestorId, seen) : false;
		},
		[parentById],
	);

	const onToggleExpanded = useCallback((pageId: string) => {
		setExpandedByPageId((prev) => ({ ...prev, [pageId]: !(prev[pageId] ?? true) }));
	}, []);

	const onCreateChild = useCallback(
		async (pageId: string) => {
			setExpandedByPageId((prev) => ({ ...prev, [pageId]: true }));
			await createPage([pageId]);
		},
		[createPage],
	);

	const handleDragEnd = useCallback(
		(event: DragEndEvent) => {
			setActiveDragId(null);
			setDragDeltaX(0);
			const activeId = String(event.active.id);
			const overId = event.over?.id ? String(event.over.id) : null;
			if (!spaceId || !overId || !flatVisibleById.has(activeId)) return;
			const currentParentId = parentById.get(activeId) ?? null;
			const nextParentId = resolveNextParentId({
				activeId,
				currentParentId,
				deltaX: event.delta.x,
				flatVisibleIds: flatVisible.map((item) => item.id),
				flatVisibleById,
				isDescendantOf,
				orderedIds,
				overId,
				parentById,
				setOrderedIds,
			});
			if (nextParentId === activeId || (nextParentId && isDescendantOf(nextParentId, activeId))) return;
			if (nextParentId === currentParentId) return;
			if (nextParentId) setExpandedByPageId((prev) => ({ ...prev, [nextParentId]: true }));
			void setPageParents.mutateAsync({
				spaceId,
				pageId: activeId,
				parentPageIds: nextParentId ? [nextParentId] : [],
			});
		},
		[flatVisible, flatVisibleById, isDescendantOf, orderedIds, parentById, setPageParents, spaceId],
	);

	return {
		activeDragId,
		dragDeltaX,
		expandedByPageId,
		filterActive,
		handleDragEnd,
		handleDragMove: (event: DragMoveEvent) => setDragDeltaX(event.delta.x),
		handleDragStart: setActiveDragId,
		isCreating: ensurePage.isPending,
		isLoading,
		onCreateChild,
		onToggleExpanded,
		sensors,
		tree: filteredTree,
		createRootPage: () => createPage([]),
	};
}

function resolveNextParentId(input: {
	activeId: string;
	currentParentId: string | null;
	deltaX: number;
	flatVisibleIds: string[];
	flatVisibleById: FlatNodeById;
	isDescendantOf: (targetId: string, ancestorId: string) => boolean;
	orderedIds: string[];
	overId: string;
	parentById: Map<string, string | null>;
	setOrderedIds: Dispatch<SetStateAction<string[]>>;
}): string | null {
	const overFlat = input.flatVisibleById.get(input.overId);
	let nextParentId = input.currentParentId;
	if (input.overId !== "__root" && overFlat && Math.abs(input.deltaX) < HORIZONTAL_INDENT_PX) {
		const activeIndex = input.orderedIds.indexOf(input.activeId);
		const overIndex = input.orderedIds.indexOf(input.overId);
		if (
			input.currentParentId === overFlat.parentId &&
			activeIndex >= 0 &&
			overIndex >= 0 &&
			activeIndex !== overIndex
		) {
			input.setOrderedIds((prev) => moveInArray(prev, activeIndex, overIndex));
		}
	}
	if (input.deltaX > HORIZONTAL_INDENT_PX) {
		const activeIndex = input.flatVisibleIds.indexOf(input.activeId);
		const overIndex =
			input.overId === "__root" ? input.flatVisibleIds.length - 1 : input.flatVisibleIds.indexOf(input.overId);
		const moved = activeIndex >= 0 && overIndex >= 0 ? moveInArray(input.flatVisibleIds, activeIndex, overIndex) : [];
		const candidateParentId = moved.indexOf(input.activeId) > 0 ? moved[moved.indexOf(input.activeId) - 1] : null;
		if (candidateParentId && !input.isDescendantOf(candidateParentId, input.activeId)) nextParentId = candidateParentId;
	} else if (input.deltaX < -HORIZONTAL_INDENT_PX) {
		nextParentId = input.currentParentId ? (input.parentById.get(input.currentParentId) ?? null) : null;
	} else if (input.overId === "__root") {
		nextParentId = null;
	}
	return nextParentId;
}
