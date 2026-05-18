import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";

import {
	type SpaceRailItem,
	SpacesRail,
} from "../components/nav/spaces-rail";

const meta = {
	title: "Nav/SpacesRail",
	parameters: { layout: "fullscreen" },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const ITEMS: SpaceRailItem[] = [
	{ id: "personal", icon: "PS", name: "Personal" },
	{ id: "team", icon: "T", name: "Team" },
	{ id: "sync", icon: "SY", name: "Syncing space", statusTone: "warning" },
	{ id: "errored", icon: "ER", name: "Out of date", statusTone: "error" },
];

function Demo() {
	const [activeId, setActiveId] = useState("team");
	return (
		<div className="flex h-screen bg-base-200">
			<SpacesRail
				activeId={activeId}
				items={ITEMS}
				onCreate={() => undefined}
				onSelect={setActiveId}
			/>
			<div className="flex-1 p-6 text-ui-sm text-base-content/70">
				Active space:{" "}
				<code className="font-mono">{activeId}</code>
			</div>
		</div>
	);
}

export const Default: Story = {
	render: () => <Demo />,
};

export const NoActiveSpace: Story = {
	render: () => (
		<div className="flex h-screen bg-base-200">
			<SpacesRail
				items={ITEMS}
				onCreate={() => undefined}
				onSelect={() => undefined}
			/>
			<div className="flex-1 p-6 text-ui-sm text-base-content/70">
				Initial state — no space active yet.
			</div>
		</div>
	),
};

export const NoCreateButton: Story = {
	render: () => (
		<div className="flex h-screen bg-base-200">
			<SpacesRail
				activeId="personal"
				items={ITEMS.slice(0, 2)}
				onSelect={() => undefined}
			/>
			<div className="flex-1 p-6 text-ui-sm text-base-content/70">
				The `+` button is optional; omit `onCreate` to hide it (e.g. for
				users without permission to create spaces).
			</div>
		</div>
	),
};

export const DarkTheme: Story = {
	parameters: { theme: "luxury" },
	render: () => <Demo />,
};
