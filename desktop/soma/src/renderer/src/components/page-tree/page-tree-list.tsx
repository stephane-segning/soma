import { cn } from "@app/lib/cn";
import { useDroppable } from "@dnd-kit/core";
import { PageTreeItem } from "./page-tree-item";
import type { PageTreeListProps } from "./types";

export function PageTreeList({
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
}: PageTreeListProps): React.JSX.Element {
	const { isOver, setNodeRef } = useDroppable({
		id: "__root",
	});

	return (
		<ul
			className={cn("w-full list-none pl-0", isOver && "rounded-md outline outline-1 outline-primary/40")}
			ref={setNodeRef}
		>
			{isLoading ? (
				<li className="px-2 py-1.5">
					<div className="skeleton h-6 w-full" />
				</li>
			) : null}
			{tree.map((node) => (
				<PageTreeItem
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
			{!isLoading && tree.length === 0 ? (
				<li className="px-2 py-1.5 text-base-content/60 text-xs">
					No pages yet. Create your first page to start writing.
				</li>
			) : null}
		</ul>
	);
}
