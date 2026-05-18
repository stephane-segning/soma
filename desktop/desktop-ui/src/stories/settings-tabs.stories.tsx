import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { Cpu, Settings, Sliders, Trash2, Users } from "react-feather";

import { SettingsTabs } from "../components/nav/settings-tabs";

const meta = {
	title: "Nav/SettingsTabs",
	parameters: { layout: "padded" },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const TABS = [
	{ id: "general", label: "General", icon: <Settings className="size-3.5" /> },
	{ id: "members", label: "Members", icon: <Users className="size-3.5" /> },
	{ id: "assistant", label: "Assistant", icon: <Sliders className="size-3.5" /> },
	{ id: "bots", label: "Bots", icon: <Cpu className="size-3.5" /> },
	{ id: "sharing", label: "Sharing" },
	{
		id: "danger",
		label: "Danger",
		icon: <Trash2 className="size-3.5" />,
		tone: "danger" as const,
	},
];

function Demo({ initial = "general" }: { initial?: string }) {
	const [active, setActive] = useState(initial);
	return (
		<div className="flex flex-col gap-4">
			<div className="flex flex-col gap-1">
				<h1 className="font-medium text-lg text-base-content">
					Space settings
				</h1>
				<SettingsTabs
					activeId={active}
					aria-label="Space settings"
					onChange={setActive}
					tabs={TABS}
				/>
			</div>
			<section className="rounded-md border border-base-300 bg-base-100 p-4 text-base-content/70 text-ui-sm">
				<span className="text-base-content">{active}</span>
				{" — placeholder content for this tab. Real consumers render a "}
				<code className="font-mono text-ui-xs">surface-card</code>
				{" stack here."}
			</section>
		</div>
	);
}

export const Default: Story = {
	render: () => <Demo />,
};

export const DangerSelected: Story = {
	render: () => <Demo initial="danger" />,
};

export const DarkTheme: Story = {
	parameters: { theme: "luxury" },
	render: () => (
		<div className="bg-base-100 p-4">
			<Demo />
		</div>
	),
};
