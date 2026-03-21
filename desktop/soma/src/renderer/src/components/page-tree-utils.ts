import type { PageRecord } from "@app/queries/pages";

type TreeNode = {
	page: PageRecord;
	children: TreeNode[];
};

type FlatNode = {
	id: string;
	parentId: string | null;
	depth: number;
};

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

export { buildTree, filterTree, flattenVisibleTree, moveInArray };
export type { FlatNode, TreeNode };
