import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { AiThinking } from "../components/chat/ai-thinking";

const meta: Meta<typeof AiThinking> = {
	title: "Chat/AiThinking",
	component: AiThinking,
	parameters: { layout: "padded" },
};

export default meta;
type Story = StoryObj<typeof AiThinking>;

const THINKING_CONTENT = `
Let me break this down step by step.

1. First, I consider the inputs provided.
2. Then I apply the relevant heuristics.
3. Finally, I synthesise an answer.
`;

export const Thinking: Story = {
	render: () => (
		<div className="max-w-lg">
			<AiThinking
				content={THINKING_CONTENT}
				defaultOpen
				status="thinking"
			/>
		</div>
	),
};

export const Complete: Story = {
	render: () => (
		<div className="max-w-lg">
			<AiThinking
				content={THINKING_CONTENT}
				defaultOpen
				durationLabel="3 seconds"
				status="complete"
			/>
		</div>
	),
};

export const CollapsedByDefault: Story = {
	render: () => (
		<div className="max-w-lg">
			<AiThinking
				content={THINKING_CONTENT}
				defaultOpen={false}
				durationLabel="2 seconds"
				status="complete"
			/>
		</div>
	),
};

export const NoContent: Story = {
	render: () => (
		<div className="max-w-lg">
			<AiThinking durationLabel="1 second" status="complete" />
		</div>
	),
};

export const LiveTransition: Story = {
	render: function LiveStory() {
		const [status, setStatus] = useState<"thinking" | "complete">("thinking");

		return (
			<div className="max-w-lg space-y-4">
				<div className="flex gap-2">
					<button
						className="btn btn-xs"
						disabled={status === "thinking"}
						onClick={() => setStatus("thinking")}
						type="button"
					>
						Reset to thinking
					</button>
					<button
						className="btn btn-xs btn-primary"
						disabled={status === "complete"}
						onClick={() => setStatus("complete")}
						type="button"
					>
						Mark complete
					</button>
				</div>
				<AiThinking
					content={THINKING_CONTENT}
					defaultOpen
					durationLabel="4 seconds"
					status={status}
				/>
			</div>
		);
	},
};
