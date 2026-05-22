import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { BackendSwitcher } from "../components/chat/backend-switcher";
import { AiInput } from "../components/forms/ai-input";
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
						<BackendSwitcher
							activeId={model}
							backends={[
								{
									id: "gpt-4o",
									name: "GPT-4o",
									meta: "Balanced reasoning + speed",
								},
								{
									id: "gpt-4o-mini",
									name: "GPT-4o mini",
									meta: "Cheaper + fast",
								},
								{ id: "agent", name: "Agent", meta: "Local agent via agentd" },
							]}
							onChange={setModel}
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
					<BackendSwitcher
						activeId={model}
						backends={[
							{ id: "agent", name: "Agent", meta: "Desktop agent via agentd" },
							{ id: "gpt-4o", name: "GPT-4o", meta: "Balanced reasoning" },
							{ id: "whisper", name: "Whisper", meta: "Transcription / voice" },
						]}
						className="min-w-[160px]"
						onChange={setModel}
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
