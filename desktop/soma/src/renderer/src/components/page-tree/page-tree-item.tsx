import type { TreeNode } from "@app/components/page-tree-utils";
import { cn } from "@app/lib/cn";
import { UNTITLED_PAGE_TITLE } from "@app/routes/screens/page-title";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { motion } from "motion/react";
import { useCallback } from "react";
import { ChevronDown, ChevronRight, Move, Plus } from "react-feather";
import { Link } from "react-router";
import { HORIZONTAL_INDENT_PX, MAX_TREE_DEPTH } from "./constants";

type PageTreeItemProps = {
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
};

export function PageTreeItem({
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
}: PageTreeItemProps): React.JSX.Element {
	const hasChildren = node.children.length > 0;
	const isExpanded = hasChildren ? filterActive || (expandedByPageId[node.page.pageId] ?? true) : false;
	const isActive = node.page.pageId === activePageId;
	const isDragging = activeDragId === node.page.pageId;
	const draggable = useDraggable({ id: node.page.pageId });
	const { attributes, listeners, setNodeRef: setDragRef, transform } = draggable;
	const transition = (draggable as { transition?: string }).transition;
	const { isOver, setNodeRef: setDropRef } = useDroppable({ id: node.page.pageId });
	const setRefs = useCallback(
		(element: HTMLElement | null) => {
			setDragRef(element);
			setDropRef(element);
		},
		[setDragRef, setDropRef],
	);

	if (depth > MAX_TREE_DEPTH) {
		return (
			<li className="text-warning text-xs">
				<Link to={`/spaces/${spaceId}/pages/${node.page.pageId}`}>Loop detected...</Link>
			</li>
		);
	}

	return (
		<motion.li className="space-y-0" layout transition={{ type: "spring", stiffness: 460, damping: 38 }}>
			<motion.div
				className={cn(
					"group flex items-center gap-2 rounded-md px-0 py-0 transition-colors duration-150",
					isOver && "bg-primary/10",
					isActive && "bg-base-200/70",
					isDragging && dragDeltaX > HORIZONTAL_INDENT_PX && "ring-1 ring-primary/40",
					isDragging && dragDeltaX < -HORIZONTAL_INDENT_PX && "ring-1 ring-warning/40",
				)}
				layout
				ref={setRefs}
				style={{
					transform: CSS.Translate.toString(transform),
					transition,
					opacity: isDragging ? 0.52 : 1,
				}}
				transition={{ type: "spring", stiffness: 460, damping: 38 }}
			>
				<TreeExpandButton
					hasChildren={hasChildren}
					isExpanded={isExpanded}
					onToggle={() => onToggleExpanded(node.page.pageId)}
				/>
				<Link
					className={cn("min-w-0 flex-1 truncate text-sm", isActive && "text-primary")}
					onClick={(event) => {
						if (activeDragId) event.preventDefault();
					}}
					to={`/spaces/${spaceId}/pages/${node.page.pageId}`}
				>
					<span className="truncate">{node.page.title || UNTITLED_PAGE_TITLE}</span>
				</Link>
				<TreeItemActions
					attributes={attributes}
					isCreating={isCreating}
					listeners={listeners}
					onCreateChild={() => onCreateChild(node.page.pageId)}
				/>
			</motion.div>
			{hasChildren && isExpanded ? (
				<motion.ul
					className="ml-5 list-none space-y-0 border-base-300/50 border-l pl-0"
					layout
					transition={{ type: "spring", stiffness: 420, damping: 36 }}
				>
					{node.children.map((child) => (
						<PageTreeItem
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

function TreeExpandButton({
	hasChildren,
	isExpanded,
	onToggle,
}: {
	hasChildren: boolean;
	isExpanded: boolean;
	onToggle: () => void;
}): React.JSX.Element {
	if (!hasChildren) return <span className="inline-block w-6 shrink-0" />;
	return (
		<button
			aria-label={isExpanded ? "Collapse children" : "Expand children"}
			className="btn btn-ghost btn-xs btn-circle shrink-0"
			onClick={(event) => {
				event.preventDefault();
				event.stopPropagation();
				onToggle();
			}}
			type="button"
		>
			{isExpanded ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
		</button>
	);
}

function TreeItemActions({
	attributes,
	isCreating,
	listeners,
	onCreateChild,
}: {
	attributes: ReturnType<typeof useDraggable>["attributes"];
	isCreating: boolean;
	listeners: ReturnType<typeof useDraggable>["listeners"];
	onCreateChild: () => Promise<void>;
}): React.JSX.Element {
	return (
		<div className="flex items-center gap-1">
			<button
				aria-label="Create child page"
				className="btn btn-ghost btn-xs btn-circle shrink-0 opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
				disabled={isCreating}
				onClick={(event) => {
					event.preventDefault();
					event.stopPropagation();
					void onCreateChild();
				}}
				onPointerDown={(event) => event.stopPropagation()}
				type="button"
			>
				<Plus className="size-3.5" />
			</button>
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
		</div>
	);
}
