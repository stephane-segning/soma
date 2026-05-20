/**
 * PanelStack stories — verify the vertical full-width stack of Panel
 * cards behaves as expected at different counts. The stack always
 * fills its host width; multiple panels split height evenly.
 */
import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";

import { PanelStack } from "../components/panels/panel-stack";

const meta = {
	title: "Panels/PanelStack",
	parameters: { layout: "fullscreen" },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

function MockRail({ children }: { children: React.ReactNode }) {
	return (
		<div className="flex h-screen items-stretch bg-base-200">
			<div className="flex flex-1 items-center justify-center text-base-content/40 text-sm">
				Mock main area
			</div>
			<div className="w-80 shrink-0">{children}</div>
		</div>
	);
}

const PLACEHOLDER = (label: string) => (
	<div className="flex h-full items-center justify-center text-base-content/40 text-sm">
		{label}
	</div>
);

export const SingleCard: Story = {
	render: () => {
		const [panels] = useState([
			{
				id: "chat",
				title: "Chat",
				content: PLACEHOLDER("Chat body — fills the whole rail."),
			},
		]);
		return (
			<MockRail>
				<PanelStack panels={panels} />
			</MockRail>
		);
	},
};

export const TwoCards: Story = {
	render: () => {
		const [panels] = useState([
			{ id: "chat", title: "Chat", content: PLACEHOLDER("Chat") },
			{ id: "bots", title: "Bots", content: PLACEHOLDER("Bots") },
		]);
		return (
			<MockRail>
				<PanelStack panels={panels} />
			</MockRail>
		);
	},
};

export const ThreeCards: Story = {
	render: () => {
		const [panels] = useState([
			{ id: "chat", title: "Chat", content: PLACEHOLDER("Chat") },
			{ id: "bots", title: "Bots", content: PLACEHOLDER("Bots") },
			{ id: "history", title: "Page history", content: PLACEHOLDER("History") },
		]);
		return (
			<MockRail>
				<PanelStack panels={panels} />
			</MockRail>
		);
	},
};

export const WithCollapseHandlers: Story = {
	render: () => {
		const [panels, setPanels] = useState([
			{ id: "chat", title: "Chat", content: PLACEHOLDER("Chat") },
			{ id: "bots", title: "Bots", content: PLACEHOLDER("Bots") },
		]);
		return (
			<MockRail>
				<PanelStack
					onCollapse={(id) => setPanels((prev) => prev.filter((p) => p.id !== id))}
					panels={panels}
				/>
			</MockRail>
		);
	},
};

export const Empty: Story = {
	render: () => (
		<MockRail>
			<PanelStack panels={[]} />
			<div className="flex h-full items-center justify-center text-base-content/40 text-xs">
				(empty — returns null)
			</div>
		</MockRail>
	),
};
