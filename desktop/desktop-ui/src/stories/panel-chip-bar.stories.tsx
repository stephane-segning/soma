/**
 * PanelChipBar stories — exercise the floating switcher in isolation.
 *
 * The chip bar is meant to live in main's top-left or top-right
 * corner, on top of the editor surface. These stories render it
 * against a mock editor background so the blurred translucent style
 * shows correctly. Each chip represents a *collapsed* panel — once
 * the user clicks it, the chip disappears (panel "expanded").
 */
import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import {
	Calendar,
	Clock,
	Cpu,
	Hash,
	List,
	MessageSquare,
} from "react-feather";

import {
	PanelChipBar,
	type PanelChipDescriptor,
} from "../components/panels/panel-chip-bar";

const meta = {
	title: "Panels/PanelChipBar",
	parameters: { layout: "fullscreen" },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const RIGHT_CHIPS: PanelChipDescriptor[] = [
	{ id: "chat", icon: <MessageSquare className="size-3.5" />, label: "Chat" },
	{ id: "bots", icon: <Cpu className="size-3.5" />, label: "Bots" },
	{
		id: "history",
		icon: <Clock className="size-3.5" />,
		label: "Page history",
	},
	{ id: "agenda", icon: <Calendar className="size-3.5" />, label: "Agenda" },
];

const LEFT_CHIPS: PanelChipDescriptor[] = [
	{ id: "pages", icon: <Hash className="size-3.5" />, label: "Pages" },
	{ id: "outline", icon: <List className="size-3.5" />, label: "Outline" },
];

function MockEditor({ children }: { children: React.ReactNode }) {
	return (
		<div className="relative h-screen w-full bg-base-100">
			<div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-base-content/40">
				<span className="text-sm">Mock editor canvas</span>
				<span className="text-xs">
					Chip bar floats absolutely on this surface.
				</span>
			</div>
			{children}
		</div>
	);
}

export const TopRight: Story = {
	render: () => {
		const [expanded, setExpanded] = useState<Set<string>>(new Set());
		return (
			<MockEditor>
				<div className="absolute top-2 right-2">
					<PanelChipBar
						expandedIds={expanded}
						onExpand={(id) =>
							setExpanded((prev) => {
								const next = new Set(prev);
								next.add(id);
								return next;
							})
						}
						panels={RIGHT_CHIPS}
						placement="top-right"
					/>
				</div>
			</MockEditor>
		);
	},
};

export const TopLeft: Story = {
	render: () => {
		const [expanded, setExpanded] = useState<Set<string>>(new Set());
		return (
			<MockEditor>
				<div className="absolute top-2 left-2">
					<PanelChipBar
						expandedIds={expanded}
						onExpand={(id) =>
							setExpanded((prev) => {
								const next = new Set(prev);
								next.add(id);
								return next;
							})
						}
						panels={LEFT_CHIPS}
						placement="top-left"
					/>
				</div>
			</MockEditor>
		);
	},
};

export const SomeExpanded: Story = {
	render: () => {
		const [expanded, setExpanded] = useState<Set<string>>(
			new Set(["chat", "bots"]),
		);
		return (
			<MockEditor>
				<div className="absolute top-2 right-2">
					<PanelChipBar
						expandedIds={expanded}
						onExpand={(id) =>
							setExpanded((prev) => {
								const next = new Set(prev);
								next.add(id);
								return next;
							})
						}
						panels={RIGHT_CHIPS}
						placement="top-right"
					/>
				</div>
			</MockEditor>
		);
	},
};

export const AllExpanded: Story = {
	render: () => (
		<MockEditor>
			<div className="absolute top-2 right-2 text-base-content/40 text-xs">
				(bar returns null when every chip is expanded)
			</div>
			<div className="absolute top-2 left-2">
				<PanelChipBar
					expandedIds={new Set(RIGHT_CHIPS.map((p) => p.id))}
					panels={RIGHT_CHIPS}
					placement="top-right"
				/>
			</div>
		</MockEditor>
	),
};

export const DarkTheme: Story = {
	parameters: { theme: "luxury" },
	render: () => {
		const [expanded, setExpanded] = useState<Set<string>>(new Set(["chat"]));
		return (
			<MockEditor>
				<div className="absolute top-2 right-2">
					<PanelChipBar
						expandedIds={expanded}
						onExpand={(id) =>
							setExpanded((prev) => {
								const next = new Set(prev);
								next.add(id);
								return next;
							})
						}
						panels={RIGHT_CHIPS}
						placement="top-right"
					/>
				</div>
			</MockEditor>
		);
	},
};
