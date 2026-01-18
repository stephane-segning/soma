import {
	DndContext,
	type DragEndEvent,
	PointerSensor,
	useDraggable,
	useDroppable,
	useSensor,
	useSensors,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import {
	type PageRecord,
	useCreatePage,
	useEnsurePageMutation,
	usePagesQuery,
	useSetPageParentsMutation,
	useUpdatePageTitleMutation,
} from "@renderer/queries/pages";
import { PolymorphButton } from "@soma/ui/components/actions/polymorph-button";
import type React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Edit2, File, Plus } from "react-feather";
import { Link } from "react-router";

type TreeNode = {
	page: PageRecord;
	children: TreeNode[];
};

type Props = {
	spaceId: string;
	activePageId?: string;
	filterTerm?: string;
	showNewButton?: boolean;
};

function buildTree(pages: PageRecord[]): TreeNode[] {
	const nodes = new Map<string, TreeNode>();
	for (const page of pages) {
		nodes.set(page.pageId, { page, children: [] });
	}

	const roots: TreeNode[] = [];
	for (const node of nodes.values()) {
		if (!node.page.parentPageIds.length) {
			roots.push(node);
			continue;
		}
		let attached = false;
		for (const parentId of node.page.parentPageIds) {
			if (parentId === node.page.pageId) continue;
			const parent = nodes.get(parentId);
			if (
				parent &&
				!parent.children.some((c) => c.page.pageId === node.page.pageId)
			) {
				parent.children.push(node);
				attached = true;
			}
		}
		if (!attached) roots.push(node);
	}
	return roots;
}

function filterTree(nodes: TreeNode[], term: string): TreeNode[] {
	if (!term.trim()) return nodes;
	const needle = term.trim().toLowerCase();

	const walk = (node: TreeNode): TreeNode | null => {
		const title = node.page.title.toLowerCase();
		const filteredChildren = node.children
			.map((child) => walk(child))
			.filter(Boolean) as TreeNode[];

		if (title.includes(needle) || filteredChildren.length > 0) {
			return { ...node, children: filteredChildren };
		}
		return null;
	};

	return nodes.map((node) => walk(node)).filter(Boolean) as TreeNode[];
}

function PageTree({
	spaceId,
	activePageId,
	filterTerm = "",
	showNewButton = true,
}: Props): React.JSX.Element | null {
	const { data, isLoading } = usePagesQuery(spaceId);
	const ensurePage = useEnsurePageMutation();
	const updatePageTitle = useUpdatePageTitleMutation();
	const setPageParents = useSetPageParentsMutation();
	const [editingPageId, setEditingPageId] = useState<string | null>(null);
	const [titleDraft, setTitleDraft] = useState("");
	const [activeDragId, setActiveDragId] = useState<string | null>(null);

	const tree = useMemo(() => buildTree(data ?? []), [data]);
	const filteredTree = useMemo(
		() => filterTree(tree, filterTerm),
		[filterTerm, tree],
	);
	const pagesById = useMemo(() => {
		const map = new Map<string, PageRecord>();
		for (const page of data ?? []) {
			map.set(page.pageId, page);
		}
		return map;
	}, [data]);

	const sensors = useSensors(
		useSensor(PointerSensor, {
			activationConstraint: { distance: 5 },
		}),
	);

	useEffect(() => {
		setEditingPageId(null);
		setTitleDraft("");
	}, [activePageId, spaceId]);

	const handleSubmitTitle = async (page: PageRecord) => {
		const trimmed = titleDraft.trim();
		const nextTitle = trimmed || page.title || "Untitled";
		if (!spaceId) return;
		if (nextTitle === page.title) {
			setEditingPageId(null);
			return;
		}
		try {
			await updatePageTitle.mutateAsync({
				spaceId,
				pageId: page.pageId,
				title: nextTitle,
			});
			setEditingPageId(null);
		} catch {
			// Keep the input open on failure so the user can retry.
		}
	};

	const isDescendantOf = useCallback(
		(
			targetId: string,
			ancestorId: string,
			seen: Set<string> = new Set(),
		): boolean => {
			if (targetId === ancestorId) return true;
			if (seen.has(targetId)) return false;
			seen.add(targetId);
			const target = pagesById.get(targetId);
			if (!target) return false;
			return target.parentPageIds.some((parentId) =>
				isDescendantOf(parentId, ancestorId, seen),
			);
		},
		[pagesById],
	);

	const handleDragEnd = useCallback(
		(event: DragEndEvent) => {
			setActiveDragId(null);
			const activeId = String(event.active.id);
			const overId = event.over?.id ? String(event.over.id) : null;
			if (!spaceId) return;
			if (overId === "__root") {
				void setPageParents.mutateAsync({
					spaceId,
					pageId: activeId,
					parentPageIds: [],
				});
				return;
			}
			if (!overId || activeId === overId) return;
			if (isDescendantOf(overId, activeId)) return;
			void setPageParents.mutateAsync({
				spaceId,
				pageId: activeId,
				parentPageIds: [overId],
			});
		},
		[isDescendantOf, setPageParents, spaceId],
	);

	const { createPage } = useCreatePage(spaceId);

	if (!spaceId) return null;

	return (
		<DndContext
			onDragEnd={handleDragEnd}
			onDragStart={(event) => setActiveDragId(String(event.active.id))}
			sensors={sensors}
		>
			<div className="space-y-2">
				{showNewButton ? (
					<div>
						<PolymorphButton
							disabled={ensurePage.isPending}
							onClick={() => createPage([])}
							variant="primary"
						>
							<Plus className="size-4" />
						</PolymorphButton>
					</div>
				) : null}

				<PageTreeList
					activeDragId={activeDragId}
					activePageId={activePageId}
					editingPageId={editingPageId}
					isLoading={isLoading}
					isSaving={updatePageTitle.isPending}
					onCancelEditing={() => {
						setEditingPageId(null);
						setTitleDraft("");
					}}
					onStartEditing={(page) => {
						setEditingPageId(page.pageId);
						setTitleDraft(page.title);
					}}
					onSubmitTitle={handleSubmitTitle}
					onTitleDraftChange={setTitleDraft}
					spaceId={spaceId}
					titleDraft={titleDraft}
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
	editingPageId,
	titleDraft,
	onTitleDraftChange,
	onStartEditing,
	onSubmitTitle,
	onCancelEditing,
	isSaving,
	isLoading,
	activeDragId,
}: {
	tree: TreeNode[];
	spaceId: string;
	activePageId?: string;
	editingPageId: string | null;
	titleDraft: string;
	onTitleDraftChange: (title: string) => void;
	onStartEditing: (page: PageRecord) => void;
	onSubmitTitle: (page: PageRecord) => void;
	onCancelEditing: () => void;
	isSaving: boolean;
	isLoading: boolean;
	activeDragId: string | null;
}): React.JSX.Element {
	const { isOver, setNodeRef } = useDroppable({ id: "__root" });

	return (
		<ul
			className={`menu w-full ${isOver ? "outline outline-1 outline-primary/40" : ""}`}
			ref={setNodeRef}
		>
			{isLoading && (
				<li className="p-2">
					<div className="skeleton h-6 w-full" />
				</li>
			)}
			{tree.map((node) => (
				<TreeItem
					activeDragId={activeDragId}
					activePageId={activePageId}
					editingPageId={editingPageId}
					isSaving={isSaving}
					key={node.page.pageId}
					node={node}
					onCancelEditing={onCancelEditing}
					onStartEditing={onStartEditing}
					onSubmitTitle={onSubmitTitle}
					onTitleDraftChange={onTitleDraftChange}
					spaceId={spaceId}
					titleDraft={titleDraft}
				/>
			))}
			{!isLoading && tree.length === 0 && (
				<li className="p-2 text-base-content/60 text-xs">No pages yet</li>
			)}
		</ul>
	);
}

function TreeItem({
	node,
	spaceId,
	activePageId,
	editingPageId,
	titleDraft,
	onTitleDraftChange,
	onStartEditing,
	onSubmitTitle,
	onCancelEditing,
	isSaving,
	activeDragId,
	depth = 0,
}: {
	node: TreeNode;
	spaceId: string;
	activePageId?: string;
	editingPageId: string | null;
	titleDraft: string;
	onTitleDraftChange: (title: string) => void;
	onStartEditing: (page: PageRecord) => void;
	onSubmitTitle: (page: PageRecord) => void;
	onCancelEditing: () => void;
	isSaving: boolean;
	activeDragId: string | null;
	depth?: number;
}): React.JSX.Element {
	if (depth > 8) {
		return (
			<li className="text-warning text-xs">
				<Link to={`/spaces/${spaceId}/pages/${node.page.pageId}`}>
					Loop detected…
				</Link>
			</li>
		);
	}

	const isActive = node.page.pageId === activePageId;
	const isEditing = node.page.pageId === editingPageId;
	const isDragging = activeDragId === node.page.pageId;

	const draggable = useDraggable({ id: node.page.pageId });
	const {
		attributes,
		listeners,
		setNodeRef: setDragRef,
		transform,
	} = draggable;
	const transition = (draggable as { transition?: string }).transition;
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
		opacity: isDragging ? 0.5 : 1,
	};

	const content = isEditing ? (
		<div className="group flex items-center gap-2">
			<span className="transition-opacity">
				<File className="size-4 shrink-0 stroke-current" />
			</span>

			<input
				className="input input-xs input-ghost flex-1 truncate"
				disabled={isSaving}
				onBlur={() => {
					void onSubmitTitle(node.page);
				}}
				onChange={(event) => onTitleDraftChange(event.target.value)}
				onKeyDown={async (event) => {
					if (event.key === "Enter") {
						event.preventDefault();
						await onSubmitTitle(node.page);
					}
					if (event.key === "Escape") {
						event.preventDefault();
						onCancelEditing();
					}
				}}
				value={titleDraft}
			/>
		</div>
	) : (
		<div
			className={`group flex items-center gap-2 ${isOver ? "bg-primary/10" : ""}`}
			ref={setRefs}
			style={style}
			{...attributes}
		>
			<button
				aria-label="Rename page"
				className="relative cursor-pointer"
				onClick={(event) => {
					event.preventDefault();
					event.stopPropagation();
					onStartEditing(node.page);
				}}
				type="button"
			>
				<span className="transition-opacity group-hover:opacity-0">
					<File className="size-4 shrink-0 stroke-current" />
				</span>
				<span className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-100">
					<Edit2 className="size-4 shrink-0 stroke-current" />
				</span>
			</button>

			<Link
				className={`${isActive ? "" : ""} flex-1`}
				to={`/spaces/${spaceId}/pages/${node.page.pageId}`}
				{...listeners}
				onClick={(event) => {
					if (activeDragId) {
						event.preventDefault();
						return;
					}
				}}
			>
				<span className="truncate">{node.page.title}</span>
			</Link>
		</div>
	);

	if (node.children.length === 0) {
		return <li>{content}</li>;
	}

	return (
		<li>
			<details open>
				<summary>{content}</summary>
				<ul>
					{node.children.map((child) => (
						<TreeItem
							activeDragId={activeDragId}
							activePageId={activePageId}
							depth={depth + 1}
							editingPageId={editingPageId}
							isSaving={isSaving}
							key={child.page.pageId}
							node={child}
							onCancelEditing={onCancelEditing}
							onStartEditing={onStartEditing}
							onSubmitTitle={onSubmitTitle}
							onTitleDraftChange={onTitleDraftChange}
							spaceId={spaceId}
							titleDraft={titleDraft}
						/>
					))}
				</ul>
			</details>
		</li>
	);
}

export { PageTree };
