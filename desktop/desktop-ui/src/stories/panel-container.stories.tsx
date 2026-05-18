import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { Calendar, Clock, FileText, List, MessageSquare } from "react-feather";

import {
	PanelContainer,
	type PanelDescriptor,
} from "../components/panels/panel-container";

const meta = {
	title: "Panels/PanelContainer",
	parameters: { layout: "fullscreen" },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const PANELS: PanelDescriptor[] = [
	{
		id: "chat",
		title: "Chat",
		icon: <MessageSquare className="size-3.5" />,
		content: (
			<div className="flex flex-col gap-2 px-3 py-2 text-ui-sm">
				<div>
					<span className="font-medium">You · 2m ago</span>
					<p className="text-base-content/80">
						Summarize the latest space activity.
					</p>
				</div>
				<div>
					<span className="font-medium text-primary">Assistant</span>
					<p className="text-base-content/80">
						You merged PR #66 (Wave 3A) 5 minutes ago, addressing 7 review
						comments. Wave 3B is in progress.
					</p>
				</div>
			</div>
		),
	},
	{
		id: "history",
		title: "Page history",
		icon: <Clock className="size-3.5" />,
		content: (
			<ul className="flex flex-col divide-y divide-base-300 text-ui-sm">
				<li className="px-3 py-2">
					<div className="font-medium">Edited heading</div>
					<div className="text-base-content/60 text-ui-xs">3m ago</div>
				</li>
				<li className="px-3 py-2">
					<div className="font-medium">Inserted code block</div>
					<div className="text-base-content/60 text-ui-xs">12m ago</div>
				</li>
				<li className="px-3 py-2">
					<div className="font-medium">Renamed page</div>
					<div className="text-base-content/60 text-ui-xs">1h ago</div>
				</li>
			</ul>
		),
	},
	{
		id: "subpages",
		title: "Sub-pages",
		icon: <FileText className="size-3.5" />,
		content: (
			<ul className="flex flex-col divide-y divide-base-300 text-ui-sm">
				<li className="px-3 py-2">Architecture</li>
				<li className="px-3 py-2">Runbooks</li>
				<li className="px-3 py-2">Design system</li>
			</ul>
		),
	},
	{
		id: "agenda",
		title: "Agenda",
		icon: <Calendar className="size-3.5" />,
		content: (
			<ul className="flex flex-col divide-y divide-base-300 text-ui-sm">
				<li className="px-3 py-2">Review Wave 3 PRs</li>
				<li className="px-3 py-2">Plan Cutover 1</li>
			</ul>
		),
	},
	{
		id: "tasks",
		title: "Tasks",
		icon: <List className="size-3.5" />,
		content: (
			<ul className="flex flex-col divide-y divide-base-300 text-ui-sm">
				<li className="px-3 py-2">Fix biome lint debt</li>
				<li className="px-3 py-2">Scrub stale Tapia doc references</li>
			</ul>
		),
	},
];

function Demo({
	initialCollapsed = ["subpages", "tasks"],
}: {
	initialCollapsed?: string[];
}) {
	const [collapsed, setCollapsed] = useState<Set<string>>(
		() => new Set(initialCollapsed),
	);
	const [openIds, setOpenIds] = useState<Set<string>>(
		() => new Set(PANELS.map((p) => p.id)),
	);
	const visiblePanels = PANELS.filter((p) => openIds.has(p.id));
	return (
		<div className="flex h-screen bg-base-200">
			<div className="flex flex-1 items-center justify-center text-base-content/40 text-ui-sm">
				Editor column…
			</div>
			<PanelContainer
				className="w-96 shrink-0"
				collapsedIds={collapsed}
				onClosePanel={(id) =>
					setOpenIds((prev) => {
						const next = new Set(prev);
						next.delete(id);
						return next;
					})
				}
				onToggleCollapse={(id) =>
					setCollapsed((prev) => {
						const next = new Set(prev);
						if (next.has(id)) {
							next.delete(id);
						} else {
							next.add(id);
						}
						return next;
					})
				}
				panels={visiblePanels}
			/>
		</div>
	);
}

export const Default: Story = {
	render: () => <Demo />,
};

export const AllCollapsed: Story = {
	render: () => <Demo initialCollapsed={PANELS.map((p) => p.id)} />,
};

export const NoneCollapsed: Story = {
	render: () => <Demo initialCollapsed={[]} />,
};

export const DarkTheme: Story = {
	parameters: { theme: "luxury" },
	render: () => <Demo />,
};
