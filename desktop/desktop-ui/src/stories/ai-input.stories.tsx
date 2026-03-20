import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { AiInput } from "../components/forms/ai-input";
import { AiModelSelector } from "../components/forms/ai-model-selector";
import { notify } from "../components/overlays/toast";

const meta: Meta<typeof AiInput> = {
	title: "Inputs/AI Input",
	component: AiInput,
	parameters: {
		layout: "padded",
	},
};

export default meta;
type Story = StoryObj<typeof AiInput>;

export const Default: Story = {
	render: function InputStory() {
		const [text, setText] = useState("");
		const [model, setModel] = useState("gpt-4o");
		return (
			<div className="space-y-4">
				<AiInput
					modelSelector={
						<AiModelSelector
							onChange={setModel}
							options={[
								{
									id: "gpt-4o",
									label: "GPT-4o",
									description: "Balanced reasoning + speed",
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
							]}
							value={model}
						/>
					}
					onAttach={() => notify.info("Attach clicked")}
					onChange={setText}
					onSend={() => {
						notify.success("Message sent");
						setText("");
					}}
					onVoice={() => notify.info("Voice clicked")}
					value={text}
				/>
				<div className="text-base-content/60 text-sm">
					Hint: this is a reusable AI input bar with attachments, mic, model
					selector, and send CTA.
				</div>
			</div>
		);
	},
};

export const WithPreset: Story = {
	args: {
		value: "Summarize the latest space activity",
		placeholder: "Ask anything...",
	},
	render: function PresetStory(args) {
		const [text, setText] = useState(args.value ?? "");
		const [model, setModel] = useState("agent");
		return (
			<AiInput
				{...args}
				modelSelector={
					<AiModelSelector
						className="min-w-[160px]"
						onChange={setModel}
						options={[
							{
								id: "agent",
								label: "Agent",
								description: "Desktop agent via agentd",
								hint: "Local",
							},
							{
								id: "gpt-4o",
								label: "GPT-4o",
								description: "Balanced reasoning",
							},
							{
								id: "whisper",
								label: "Whisper",
								description: "Transcription / voice",
								hint: "Audio",
							},
						]}
						value={model}
					/>
				}
				onChange={setText}
				onSend={() => notify.success(`Sent: ${text}`)}
				onVoice={() => notify.info("Voice listening")}
				value={text}
			/>
		);
	},
};
