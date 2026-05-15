import type { FlatNode, TreeNode } from "@app/components/page-tree-utils";

export type PageTreeProps = {
	spaceId: string;
	activePageId?: string;
	filterTerm?: string;
	showNewButton?: boolean;
};

export type PageTreeListProps = {
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
};

export type PageTreeModel = Omit<PageTreeListProps, "tree" | "spaceId"> & {
	tree: TreeNode[];
	createRootPage: () => void;
	handleDragEnd: (event: import("@dnd-kit/core").DragEndEvent) => void;
	handleDragMove: (event: import("@dnd-kit/core").DragMoveEvent) => void;
	handleDragStart: (id: string) => void;
	sensors: ReturnType<typeof import("@dnd-kit/core").useSensors>;
};

export type FlatNodeById = Map<string, FlatNode>;
