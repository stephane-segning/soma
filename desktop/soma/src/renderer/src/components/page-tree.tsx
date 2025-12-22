import {
	useEnsurePageMutation,
	usePagesQuery,
	type PageRecord,
} from "@renderer/queries/pages";
import React from "react";
import { useMemo } from "react";
import { Link, useNavigate } from "react-router";
import { Plus } from "react-feather";

type TreeNode = {
	page: PageRecord;
	children: TreeNode[];
};

type Props = {
	spaceId: string;
	activePageId?: string;
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
			if (parent && !parent.children.some((c) => c.page.pageId === node.page.pageId)) {
				parent.children.push(node);
				attached = true;
			}
		}
		if (!attached) roots.push(node);
	}
	return roots;
}

function FileIcon(): React.JSX.Element {
	return (
		<svg
			xmlns="http://www.w3.org/2000/svg"
			fill="none"
			viewBox="0 0 24 24"
			strokeWidth="1.5"
			stroke="currentColor"
			className="h-4 w-4"
		>
			<path
				strokeLinecap="round"
				strokeLinejoin="round"
				d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
			/>
		</svg>
	);
}

function PageTree({ spaceId, activePageId }: Props): React.JSX.Element | null {
	const { data, isLoading } = usePagesQuery(spaceId);
	const ensurePage = useEnsurePageMutation();
	const navigate = useNavigate();

	const tree = useMemo(() => buildTree(data ?? []), [data]);

	if (!spaceId) return null;

	return (
		<div className="space-y-2">
			<button
				className="btn btn-soft btn-circle btn-primary btn-xs"
				aria-label="New page"
				disabled={ensurePage.isPending}
				onClick={async () => {
					try {
						const created = await ensurePage.mutateAsync({
							spaceId,
							parentPageIds: activePageId ? [activePageId] : [],
						});
						navigate(`/spaces/${spaceId}/pages/${created.pageId}`);
					} catch {
						// ignored
					}
				}}
			>
				<Plus size={14} />
			</button>

			<ul className="menu menu-xs w-full rounded-box bg-base-200">
				{isLoading && (
					<li className="p-2">
						<div className="skeleton h-6 w-full" />
					</li>
				)}
				{tree.map((node) => (
					<TreeItem
						key={node.page.pageId}
						node={node}
						spaceId={spaceId}
						activePageId={activePageId}
					/>
				))}
				{!isLoading && tree.length === 0 && (
					<li className="p-2 text-xs text-base-content/60">No pages yet</li>
				)}
			</ul>
		</div>
	);
}

function TreeItem({
	node,
	spaceId,
	activePageId,
	depth = 0,
}: {
	node: TreeNode;
	spaceId: string;
	activePageId?: string;
	depth?: number;
}): React.JSX.Element {
	if (depth > 8) {
		return (
			<li className="text-xs text-warning">
				<Link to={`/spaces/${spaceId}/pages/${node.page.pageId}`}>
					Loop detected…
				</Link>
			</li>
		);
	}
	const isActive = node.page.pageId === activePageId;
	const content = (
		<Link
			className={isActive ? "active" : ""}
			to={`/spaces/${spaceId}/pages/${node.page.pageId}`}
		>
			<span className="flex items-center gap-2">
				<FileIcon />
				<span className="truncate">{node.page.title}</span>
			</span>
		</Link>
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
							key={child.page.pageId}
							node={child}
							spaceId={spaceId}
							activePageId={activePageId}
							depth={depth + 1}
						/>
					))}
				</ul>
			</details>
		</li>
	);
}

export { PageTree };
