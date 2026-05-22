/**
 * PanelChipBar stories — exercise the floating switcher in isolation.
 *
 * The chip bar is meant to live in main's top-left or top-right
 * corner, on top of the editor surface. These stories render it
 * against a mock editor background so the blurred translucent style
 * shows correctly. Every chip is persistent now — clicking it toggles
 * the matching panel; expanded chips carry a primary-color tint.
 */
import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { Calendar, Clock, Cpu, Hash, List, MessageSquare } from "react-feather";

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
					Click a chip to toggle the panel — expanded chips tint primary.
				</span>
			</div>
			{children}
		</div>
	);
}

function useToggle(initial: string[] = []) {
	const [expanded, setExpanded] = useState<Set<string>>(() => new Set(initial));
	const toggle = (id: string) =>
		setExpanded((prev) => {
			const next = new Set(prev);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});
	return { expanded, toggle };
}

export const TopRight: Story = {
	render: () => {
		const { expanded, toggle } = useToggle();
		return (
			<MockEditor>
				<div className="absolute top-2 right-2">
					<PanelChipBar
						expandedIds={expanded}
						onToggle={toggle}
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
		const { expanded, toggle } = useToggle();
		return (
			<MockEditor>
				<div className="absolute top-2 left-2">
					<PanelChipBar
						expandedIds={expanded}
						onToggle={toggle}
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
		const { expanded, toggle } = useToggle(["chat", "bots"]);
		return (
			<MockEditor>
				<div className="absolute top-2 right-2">
					<PanelChipBar
						expandedIds={expanded}
						onToggle={toggle}
						panels={RIGHT_CHIPS}
						placement="top-right"
					/>
				</div>
			</MockEditor>
		);
	},
};

export const AllExpanded: Story = {
	render: () => {
		const { expanded, toggle } = useToggle(RIGHT_CHIPS.map((p) => p.id));
		return (
			<MockEditor>
				<div className="absolute top-2 right-2">
					<PanelChipBar
						expandedIds={expanded}
						onToggle={toggle}
						panels={RIGHT_CHIPS}
						placement="top-right"
					/>
				</div>
			</MockEditor>
		);
	},
};

export const DarkTheme: Story = {
	parameters: { theme: "luxury" },
	render: () => {
		const { expanded, toggle } = useToggle(["chat"]);
		return (
			<MockEditor>
				<div className="absolute top-2 right-2">
					<PanelChipBar
						expandedIds={expanded}
						onToggle={toggle}
						panels={RIGHT_CHIPS}
						placement="top-right"
					/>
				</div>
			</MockEditor>
		);
	},
};
