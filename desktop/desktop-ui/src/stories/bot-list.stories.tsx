import type { Meta, StoryObj } from "@storybook/react";

import { type Bot, BotList } from "../components/lists/bot-list";

const meta = {
	title: "Lists/BotList",
	parameters: { layout: "padded" },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const BOTS: Bot[] = [
	{
		id: "bot-1",
		alias: "fetcher",
		peerId: "12D3KooWAbCd1234efGhIjKlMnOpQrStUvWx",
		status: "active",
		lastAcked: "just now",
	},
	{
		id: "bot-2",
		alias: "archive",
		peerId: "12D3KooWPe1011mnOpQrStUvWxYzAbCdEfGh",
		status: "pending",
		lastAcked: "30s ago",
	},
	{
		id: "bot-3",
		alias: "keeper",
		peerId: "12D3KooWX55XzZzZ9999PpQrStUvWxYzAbCd",
		status: "failed",
		errorReason:
			"Signature rejected: issuer capability expired (2026-04-12). Re-issue from the owner peer to retry.",
		lastAcked: "5m ago",
	},
];

export const Default: Story = {
	render: () => (
		<div className="max-w-2xl">
			<BotList
				bots={BOTS}
				onAddBot={() => undefined}
				onOverflow={(id) => alert(`overflow menu for ${id}`)}
				onRetry={(id) => alert(`retry ${id}`)}
				onSelect={(id) => alert(`open ${id}`)}
			/>
		</div>
	),
};

export const Empty: Story = {
	render: () => (
		<div className="max-w-2xl">
			<BotList bots={[]} onAddBot={() => alert("add bot")} />
		</div>
	),
};

export const EmptyNoCta: Story = {
	render: () => (
		<div className="max-w-2xl">
			<BotList bots={[]} />
		</div>
	),
};

export const AllActive: Story = {
	render: () => (
		<div className="max-w-2xl">
			<BotList
				bots={BOTS.filter((b) => b.status === "active")}
				onOverflow={() => undefined}
			/>
		</div>
	),
};

export const DarkTheme: Story = {
	parameters: { theme: "luxury" },
	render: () => (
		<div className="max-w-2xl bg-base-100 p-4">
			<BotList
				bots={BOTS}
				onAddBot={() => undefined}
				onOverflow={() => undefined}
				onRetry={() => undefined}
				onSelect={() => undefined}
			/>
		</div>
	),
};
