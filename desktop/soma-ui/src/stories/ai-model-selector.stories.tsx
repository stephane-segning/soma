import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { AiModelSelector } from "../components/forms/ai-model-selector";

const meta: Meta<typeof AiModelSelector> = {
	title: "Inputs/AI Model Selector",
	component: AiModelSelector,
	parameters: { layout: "padded" },
	args: {
		options: [
			{
				id: "gpt-4o",
				label: "GPT-4o",
				description: "Balanced reasoning and speed",
			},
			{
				id: "gpt-4o-mini",
				label: "GPT-4o mini",
				description: "Cheaper + fast",
			},
			{
				id: "agent",
				label: "Agent",
				description: "Local agent via agentd",
				hint: "Local",
			},
		],
		value: "gpt-4o",
	},
};

export default meta;
type Story = StoryObj<typeof AiModelSelector>;

export const Default: Story = {
	render: (args) => {
		const [model, setModel] = useState(args.value);
		return <AiModelSelector {...args} value={model} onChange={setModel} />;
	},
};
