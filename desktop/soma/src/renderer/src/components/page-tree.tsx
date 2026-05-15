import { DndContext } from "@dnd-kit/core";
import { PolymorphButton } from "@soma/ui/components/actions/polymorph-button";
import { Plus } from "react-feather";
import { PageTreeList } from "./page-tree/page-tree-list";
import type { PageTreeProps } from "./page-tree/types";
import { usePageTreeModel } from "./page-tree/use-page-tree-model";

function PageTree({
	spaceId,
	activePageId,
	filterTerm = "",
	showNewButton = true,
}: PageTreeProps): React.JSX.Element | null {
	const model = usePageTreeModel(spaceId, filterTerm);

	if (!spaceId) return null;

	return (
		<DndContext
			onDragEnd={model.handleDragEnd}
			onDragMove={model.handleDragMove}
			onDragStart={(event) => model.handleDragStart(String(event.active.id))}
			sensors={model.sensors}
		>
			<div className="space-y-2">
				{showNewButton ? (
					<div>
						<PolymorphButton disabled={model.isCreating} onClick={model.createRootPage} variant="primary">
							<Plus className="size-4" />
						</PolymorphButton>
					</div>
				) : null}

				<PageTreeList
					activeDragId={model.activeDragId}
					activePageId={activePageId}
					dragDeltaX={model.dragDeltaX}
					expandedByPageId={model.expandedByPageId}
					filterActive={model.filterActive}
					isCreating={model.isCreating}
					isLoading={model.isLoading}
					onCreateChild={model.onCreateChild}
					onToggleExpanded={model.onToggleExpanded}
					spaceId={spaceId}
					tree={model.tree}
				/>
			</div>
		</DndContext>
	);
}

export { PageTree };
