import type { Meta, StoryObj } from "@storybook/react";
import { useEffect, useState } from "react";
import { AiChat } from "../components/chat/ai-chat";
import { AiConversation } from "../components/chat/ai-conversation";
import type { ChatMessage } from "../components/chat/ai-message";
import { AiInput } from "../components/forms/ai-input";
import { AiModelSelector } from "../components/forms/ai-model-selector";
import { notify } from "../components/overlays/toast";

const meta: Meta = {
	title: "Chat/AI Conversation",
	parameters: { layout: "fullscreen" },
};

export default meta;
type Story = StoryObj;

export const WithThinking: Story = {
	render: function ChatStory() {
		const [messages, setMessages] = useState<ChatMessage[]>([
			{
				id: "u1",
				role: "user",
				content: "How does blob caching work in Soma?",
			},
			{
				id: "a1",
				role: "assistant",
				content:
					"Blobs are content-addressed; bots cache CIDs and validate bytes before serving.",
				thinking: {
					status: "complete",
					durationLabel: "3 seconds",
					content: "Step-by-step reasoning goes here.",
				},
			},
			{ id: "u2", role: "user", content: "Show me a summary of the steps." },
		]);
		const [input, setInput] = useState("");
		const [model, setModel] = useState("gpt-4o");

		// fake streaming thinking
		useEffect(() => {
			const timer = setTimeout(() => {
				setMessages((prev) =>
					prev.map((m) =>
						m.id === "a2"
							? {
									...m,
									thinking: {
										...m.thinking,
										status: "complete",
										durationLabel: "2 seconds",
									},
								}
							: m,
					),
				);
			}, 1500);
			return () => clearTimeout(timer);
		}, []);

		return (
			<div className="flex h-screen flex-col bg-base-200">
				<div className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-4 p-6">
					<AiChat maxHeight="60vh">
						<AiConversation messages={messages} />
					</AiChat>
					<AiInput
						modelSelector={
							<AiModelSelector
								onChange={setModel}
								options={[
									{
										id: "gpt-4o",
										label: "GPT-4o",
										description: "Reasoning + speed",
									},
									{ id: "agent", label: "Agentd", description: "Local agent" },
								]}
								value={model}
							/>
						}
						onChange={setInput}
						onSend={() => {
							if (!input.trim()) return;
							setMessages((prev) => [
								...prev,
								{ id: `u-${prev.length}`, role: "user", content: input },
								{
									id: "a2",
									role: "assistant",
									content: "Here is your answer.",
									thinking: {
										status: "thinking",
										content: "Thinking through the steps...",
										durationLabel: "...",
									},
								},
							]);
							setInput("");
							notify.success(`Sent with ${model}`);
						}}
						value={input}
					/>
				</div>
			</div>
		);
	},
};

export const ToolsAndSources: Story = {
	render: function ToolsStory() {
		const messages: ChatMessage[] = [
			{ id: "u1", role: "user", content: "Summarize the latest agent logs." },
			{
				id: "t1",
				role: "tool",
				meta: "log.search",
				content: "Fetched 2 log lines with level=error",
			},
			{
				id: "s1",
				role: "source",
				content: "Source link: https://example.com/logs#123",
				meta: "Logs service",
			},
			{
				id: "a1",
				role: "assistant",
				content:
					"The agent reported two errors related to blob validation. No retries occurred.",
			},
		];
		return (
			<div className="flex h-screen items-start justify-center bg-base-200 p-6">
				<AiChat className="w-full max-w-3xl" maxHeight="50vh">
					<AiConversation messages={messages} />
				</AiChat>
			</div>
		);
	},
};

export const StreamingThinking: Story = {
	render: function StreamStory() {
		const [messages, setMessages] = useState<ChatMessage[]>([
			{ id: "u1", role: "user", content: "Plan a 3-step onboarding for Soma." },
			{
				id: "a1",
				role: "assistant",
				content: "",
				thinking: {
					status: "thinking",
					content: "Considering onboarding flow...",
					durationLabel: "...",
				},
			},
		]);

		useEffect(() => {
			const timer = setTimeout(() => {
				setMessages((prev) =>
					prev.map((m) =>
						m.id === "a1"
							? {
									...m,
									content:
										"- Install daemon\n- Join a space\n- Sync docs and blobs",
									thinking: {
										status: "complete",
										durationLabel: "4 seconds",
										content: m.thinking?.content,
									},
								}
							: m,
					),
				);
			}, 1800);
			return () => clearTimeout(timer);
		}, []);

		return (
			<div className="flex h-screen items-start justify-center bg-base-200 p-6">
				<AiChat className="w-full max-w-2xl" maxHeight="40vh">
					<AiConversation messages={messages} />
				</AiChat>
			</div>
		);
	},
};
