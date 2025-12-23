import {
	type PageRecord,
	useEnsurePageMutation,
	usePagesQuery,
	useUpdatePageTitleMutation,
} from "@renderer/queries/pages";
import type React from "react";
import { useEffect, useMemo, useState } from "react";
import { Edit2, File, Plus } from "react-feather";
import { Link, useNavigate } from "react-router";

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

function PageTree({ spaceId, activePageId }: Props): React.JSX.Element | null {
	const { data, isLoading } = usePagesQuery(spaceId);
	const ensurePage = useEnsurePageMutation();
	const updatePageTitle = useUpdatePageTitleMutation();
	const [editingPageId, setEditingPageId] = useState<string | null>(null);
	const [titleDraft, setTitleDraft] = useState("");
	const navigate = useNavigate();

	const tree = useMemo(() => buildTree(data ?? []), [data]);

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

	if (!spaceId) return null;

	return (
		<div className="space-y-2">
			<button
				aria-label="New page"
				className="btn btn-soft btn-circle btn-primary btn-xs"
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

			<ul className="menu w-full rounded-box">
				{isLoading && (
					<li className="p-2">
						<div className="skeleton h-6 w-full" />
					</li>
				)}
				{tree.map((node) => (
					<TreeItem
						activePageId={activePageId}
						editingPageId={editingPageId}
						isSaving={updatePageTitle.isPending}
						key={node.page.pageId}
						node={node}
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
					/>
				))}
				{!isLoading && tree.length === 0 && (
					<li className="p-2 text-base-content/60 text-xs">No pages yet</li>
				)}
			</ul>
		</div>
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
	const content = isEditing ? (
		<div className="group flex items-center gap-2">
			<span className="transition-opacity">
				<File className="size-4 shrink-0 stroke-current" />
			</span>

			<input
				autoFocus={true}
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
		<div className="group flex items-center gap-2">
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
				<span className="transition-opacity">
					<File className="size-4 shrink-0 stroke-current" />
				</span>
				<span className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity">
					<Edit2 className="size-4 shrink-0 stroke-current" />
				</span>
			</button>

			<Link
				className={`${isActive ? "active" : ""} flex-1`}
				to={`/spaces/${spaceId}/pages/${node.page.pageId}`}
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
