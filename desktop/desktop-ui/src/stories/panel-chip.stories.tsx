import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { Calendar, Hash, MessageSquare, Settings } from "react-feather";
import { PanelChip } from "../components/panels/panel-chip";

const meta: Meta<typeof PanelChip> = {
	title: "Panels/PanelChip",
	component: PanelChip,
	parameters: { layout: "padded" },
};

export default meta;
type Story = StoryObj<typeof PanelChip>;

export const Default: Story = {
	render: () => (
		<div className="inline-flex items-center gap-1 rounded-lg bg-base-200 p-1">
			<PanelChip icon={<MessageSquare size={14} />} label="Chat" />
		</div>
	),
};

export const ExpandedAndCollapsed: Story = {
	render: () => (
		<div className="space-y-3">
			<p className="text-base-content/60 text-sm">
				Expanded chips carry a soft primary tint so the bar reads as a state
				indicator, not just an overflow menu.
			</p>
			<div className="inline-flex items-center gap-1 rounded-lg bg-base-200 p-1">
				<PanelChip
					expanded
					icon={<MessageSquare size={14} />}
					label="Chat (open)"
				/>
				<PanelChip icon={<Hash size={14} />} label="Pages" />
				<PanelChip
					expanded
					icon={<Calendar size={14} />}
					label="Agenda (open)"
				/>
				<PanelChip icon={<Settings size={14} />} label="Settings" />
			</div>
		</div>
	),
};

export const Interactive: Story = {
	render: function InteractiveStory() {
		const [expanded, setExpanded] = useState<Set<string>>(new Set(["chat"]));
		const toggle = (id: string) =>
			setExpanded((prev) => {
				const next = new Set(prev);
				if (next.has(id)) next.delete(id);
				else next.add(id);
				return next;
			});
		return (
			<div className="space-y-3">
				<p className="text-base-content/60 text-sm">
					Click any chip to toggle its expanded state.
				</p>
				<div className="inline-flex items-center gap-1 rounded-lg bg-base-200 p-1">
					{[
						{ id: "chat", icon: <MessageSquare size={14} />, label: "Chat" },
						{ id: "pages", icon: <Hash size={14} />, label: "Pages" },
						{ id: "agenda", icon: <Calendar size={14} />, label: "Agenda" },
					].map((chip) => (
						<PanelChip
							expanded={expanded.has(chip.id)}
							icon={chip.icon}
							key={chip.id}
							label={chip.label}
							onClick={() => toggle(chip.id)}
						/>
					))}
				</div>
			</div>
		);
	},
};
