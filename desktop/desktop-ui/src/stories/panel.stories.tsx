import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { Plus, RefreshCw } from "react-feather";
import { Panel } from "../components/panels/panel";

const meta: Meta<typeof Panel> = {
	title: "Panels/Panel",
	component: Panel,
	parameters: { layout: "padded" },
};

export default meta;
type Story = StoryObj<typeof Panel>;

const SampleContent = () => (
	<ul className="flex flex-col divide-y divide-base-300 text-sm">
		<li className="px-3 py-2">Edited heading — 3m ago</li>
		<li className="px-3 py-2">Inserted code block — 12m ago</li>
		<li className="px-3 py-2">Renamed page — 1h ago</li>
	</ul>
);

export const Default: Story = {
	render: () => (
		<div className="w-72">
			<Panel title="History">
				<SampleContent />
			</Panel>
		</div>
	),
};

export const WithCollapseAndClose: Story = {
	render: function CollapseStory() {
		const [visible, setVisible] = useState(true);
		if (!visible) {
			return (
				<button
					className="btn btn-sm"
					onClick={() => setVisible(true)}
					type="button"
				>
					Restore panel
				</button>
			);
		}
		return (
			<div className="w-72">
				<Panel
					onClose={() => setVisible(false)}
					onCollapse={() => setVisible(false)}
					title="History"
				>
					<SampleContent />
				</Panel>
			</div>
		);
	},
};

export const WithActions: Story = {
	render: () => (
		<div className="w-72">
			<Panel
				actions={
					<button
						aria-label="Refresh"
						className="grid size-5 place-items-center rounded text-base-content/50 hover:bg-base-200"
						type="button"
					>
						<RefreshCw size={12} />
					</button>
				}
				onClose={() => {}}
				title="Activity"
			>
				<SampleContent />
			</Panel>
		</div>
	),
};

export const WithFooter: Story = {
	render: () => (
		<div className="w-72">
			<Panel
				footer={
					<div className="flex items-center justify-between">
						<span>3 items</span>
						<button className="btn btn-xs btn-ghost" type="button">
							<Plus size={10} /> New
						</button>
					</div>
				}
				onCollapse={() => {}}
				title="Tasks"
			>
				<SampleContent />
			</Panel>
		</div>
	),
};

export const TallContent: Story = {
	render: () => (
		<div className="h-64 w-72">
			<Panel onClose={() => {}} title="Long list">
				<ul className="flex flex-col divide-y divide-base-300 text-sm">
					{Array.from({ length: 12 }, (_, i) => (
						<li className="px-3 py-2" key={i}>
							Item {i + 1} — some details here
						</li>
					))}
				</ul>
			</Panel>
		</div>
	),
};

export const DarkTheme: Story = {
	parameters: { theme: "luxury" },
	render: () => (
		<div className="w-72">
			<Panel onClose={() => {}} onCollapse={() => {}} title="Chat">
				<SampleContent />
			</Panel>
		</div>
	),
};
