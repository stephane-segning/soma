/**
 * PanelContainer stories — exercise the rail-side host on its own.
 *
 * The chip bar (the collapsed-panel switcher) is **not** part of
 * PanelContainer anymore; it lives in main's top-corner via
 * `<DesktopShell mainTopRight={…}>`. To keep these stories
 * self-contained, we render a minimal local chip bar so the user can
 * toggle panels open/closed and see the container react.
 */
import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { Calendar, Clock, FileText, List, MessageSquare } from "react-feather";

import {
	PanelContainer,
	type PanelDescriptor,
} from "../components/panels/panel-container";
import { PanelChipBar } from "../components/panels/panel-chip-bar";

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
			<div className="flex flex-col gap-2 px-3 py-2 text-sm">
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
			<ul className="flex flex-col divide-y divide-base-300 text-sm">
				<li className="px-3 py-2">
					<div className="font-medium">Edited heading</div>
					<div className="text-base-content/60 text-xs">3m ago</div>
				</li>
				<li className="px-3 py-2">
					<div className="font-medium">Inserted code block</div>
					<div className="text-base-content/60 text-xs">12m ago</div>
				</li>
				<li className="px-3 py-2">
					<div className="font-medium">Renamed page</div>
					<div className="text-base-content/60 text-xs">1h ago</div>
				</li>
			</ul>
		),
	},
	{
		id: "subpages",
		title: "Sub-pages",
		icon: <FileText className="size-3.5" />,
		content: (
			<ul className="flex flex-col divide-y divide-base-300 text-sm">
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
			<ul className="flex flex-col divide-y divide-base-300 text-sm">
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
			<ul className="flex flex-col divide-y divide-base-300 text-sm">
				<li className="px-3 py-2">Fix biome lint debt</li>
				<li className="px-3 py-2">Scrub stale Tapia doc references</li>
			</ul>
		),
	},
];

function Demo({ initialExpanded = ["chat"] }: { initialExpanded?: string[] }) {
	const [expanded, setExpanded] = useState<Set<string>>(
		() => new Set(initialExpanded),
	);
	return (
		<div className="relative flex h-screen bg-base-200">
			<div className="relative flex-1">
				<div className="flex h-full items-center justify-center text-base-content/40 text-sm">
					Mock editor column
				</div>
				<div className="absolute top-2 right-2">
					<PanelChipBar
						expandedIds={expanded}
						onToggle={(id) =>
							setExpanded((prev) => {
								const next = new Set(prev);
								if (next.has(id)) next.delete(id);
								else next.add(id);
								return next;
							})
						}
						panels={PANELS}
						placement="top-right"
					/>
				</div>
			</div>
			{expanded.size > 0 ? (
				<aside className="w-80 shrink-0">
					<PanelContainer
						expandedIds={expanded}
						onCollapse={(id) =>
							setExpanded((prev) => {
								const next = new Set(prev);
								next.delete(id);
								return next;
							})
						}
						panels={PANELS}
					/>
				</aside>
			) : null}
		</div>
	);
}

export const SingleExpanded: Story = {
	render: () => <Demo initialExpanded={["chat"]} />,
};

export const TwoExpanded: Story = {
	render: () => <Demo initialExpanded={["chat", "history"]} />,
};

export const AllCollapsed: Story = {
	render: () => <Demo initialExpanded={[]} />,
};

export const AllExpanded: Story = {
	render: () => <Demo initialExpanded={PANELS.map((p) => p.id)} />,
};

export const DarkTheme: Story = {
	parameters: { theme: "luxury" },
	render: () => <Demo initialExpanded={["chat", "bots"]} />,
};
