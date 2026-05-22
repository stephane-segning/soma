import type { Meta, StoryObj } from "@storybook/react";
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

export const AllChips: Story = {
	render: () => (
		<div className="inline-flex items-center gap-1 rounded-lg bg-base-200 p-1">
			<PanelChip icon={<MessageSquare size={14} />} label="Chat" />
			<PanelChip icon={<Hash size={14} />} label="Pages" />
			<PanelChip icon={<Calendar size={14} />} label="Agenda" />
			<PanelChip icon={<Settings size={14} />} label="Settings" />
		</div>
	),
};

export const WithClickHandler: Story = {
	render: function ClickStory() {
		return (
			<div className="space-y-3">
				<p className="text-base-content/60 text-sm">
					Clicking a chip expands the panel (simulated by console log).
				</p>
				<div className="inline-flex items-center gap-1 rounded-lg bg-base-200 p-1">
					{[
						{ id: "chat", icon: <MessageSquare size={14} />, label: "Chat" },
						{ id: "pages", icon: <Hash size={14} />, label: "Pages" },
					].map((chip) => (
						<PanelChip
							icon={chip.icon}
							key={chip.id}
							label={chip.label}
							onClick={() => console.log(`expand ${chip.id}`)}
						/>
					))}
				</div>
			</div>
		);
	},
};
