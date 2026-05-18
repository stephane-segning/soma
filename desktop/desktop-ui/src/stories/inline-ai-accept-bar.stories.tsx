import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";

import { InlineAIAcceptBar } from "../components/editor/inline-ai-accept-bar";

const meta = {
	title: "Editor/InlineAIAcceptBar",
	parameters: { layout: "padded" },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const SAMPLE_OUTPUT = `The Soma platform is a local-first workspace where TipTap is the user's memory and the LLM is the productivity tool. Bots are programmable peers addressed via @bot:<alias> mentions.`;

function Demo({
	withPrompt = false,
	withRefine = true,
	withTryAgain = true,
	withOpenInChat = true,
}: {
	withPrompt?: boolean;
	withRefine?: boolean;
	withTryAgain?: boolean;
	withOpenInChat?: boolean;
}) {
	const [log, setLog] = useState<string[]>([]);
	function record(action: string) {
		setLog((prev) => [action, ...prev]);
	}
	return (
		<div className="flex max-w-2xl flex-col gap-3 text-ui-sm">
			<div className="rounded-md border border-base-300 bg-base-100 p-3 text-base-content/90">
				<p>{SAMPLE_OUTPUT}</p>
			</div>
			<InlineAIAcceptBar
				onAccept={() => record("accept")}
				onDiscard={() => record("discard")}
				onOpenInChat={withOpenInChat ? () => record("open-in-chat") : undefined}
				onRefine={withRefine ? () => record("refine") : undefined}
				onTryAgain={withTryAgain ? () => record("try-again") : undefined}
				prompt={
					withPrompt ? (
						<span>
							Ask AI: <span className="font-medium">summarize this paragraph</span>
						</span>
					) : undefined
				}
			/>
			<div className="rounded-md border border-base-300 p-2 text-base-content/60">
				<div className="text-ui-xs uppercase">Action log</div>
				{log.length === 0 ? (
					<div>No actions yet.</div>
				) : (
					<ul className="font-mono text-ui-xs">
						{log.map((entry, idx) => (
							// biome-ignore lint/suspicious/noArrayIndexKey: append-only log
							<li key={idx}>{entry}</li>
						))}
					</ul>
				)}
			</div>
		</div>
	);
}

export const Default: Story = {
	render: () => <Demo />,
};

export const WithPrompt: Story = {
	render: () => <Demo withPrompt />,
};

export const AcceptDiscardOnly: Story = {
	render: () => (
		<Demo withOpenInChat={false} withRefine={false} withTryAgain={false} />
	),
};

export const DarkTheme: Story = {
	parameters: { theme: "luxury" },
	render: () => (
		<div className="bg-base-100 p-4">
			<Demo withPrompt />
		</div>
	),
};
