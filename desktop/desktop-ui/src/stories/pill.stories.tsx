import type { Meta, StoryObj } from "@storybook/react";

import { Pill } from "../components/primitives/pill";

const meta = {
	title: "Primitives/Pill",
	parameters: { layout: "padded" },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const Tones: Story = {
	render: () => (
		<div className="flex flex-wrap gap-2">
			<Pill tone="neutral">Neutral</Pill>
			<Pill tone="info">Info</Pill>
			<Pill tone="success">Success</Pill>
			<Pill tone="warning">Warning</Pill>
			<Pill tone="error">Error</Pill>
		</div>
	),
};

export const WithDot: Story = {
	render: () => (
		<div className="flex flex-wrap gap-2">
			<Pill dot tone="neutral">
				Neutral · solid
			</Pill>
			<Pill dot="pulse" tone="neutral">
				Neutral · pulsing
			</Pill>
			<Pill dot tone="success">
				Success · solid
			</Pill>
			<Pill dot="pulse" tone="success">
				Success · pulsing
			</Pill>
			<Pill dot tone="error">
				Error · solid
			</Pill>
		</div>
	),
};

// The locked semantic combos that consumers should match across the app.
export const BotStatusCombos: Story = {
	render: () => (
		<div className="flex flex-col gap-3 text-ui-sm">
			<div className="flex items-center gap-3">
				<Pill dot="pulse" tone="neutral">
					Pending
				</Pill>
				<span className="text-base-content/60">Bot handshake in progress</span>
			</div>
			<div className="flex items-center gap-3">
				<Pill dot tone="success">
					Active
				</Pill>
				<span className="text-base-content/60">Bot acked and registered</span>
			</div>
			<div className="flex items-center gap-3">
				<Pill dot tone="error">
					Failed
				</Pill>
				<span className="text-base-content/60">
					Handshake or signature rejected
				</span>
			</div>
		</div>
	),
};

export const Defaults: Story = {
	render: () => (
		<div className="flex flex-wrap gap-2 text-base-content/80">
			<span>Ollama</span>
			<Pill tone="info">Default</Pill>
			<span>·</span>
			<span>LM Studio</span>
			<Pill tone="neutral">5 scopes</Pill>
		</div>
	),
};

export const DarkTheme: Story = {
	parameters: { theme: "luxury" },
	render: () => (
		<div className="flex flex-wrap gap-2 bg-base-100 p-4">
			<Pill tone="neutral">Neutral</Pill>
			<Pill tone="info">Info</Pill>
			<Pill tone="success">Success</Pill>
			<Pill tone="warning">Warning</Pill>
			<Pill tone="error">Error</Pill>
			<Pill dot="pulse" tone="neutral">
				Pending
			</Pill>
		</div>
	),
};
