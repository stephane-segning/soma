import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { AiChat } from "soma-ui/components/chat/ai-chat";
import { AiConversation } from "soma-ui/components/chat/ai-conversation";
import { AiInput } from "soma-ui/components/forms/ai-input";
import { AiModelSelector } from "soma-ui/components/forms/ai-model-selector";
import { useChatConversation } from "../hooks/use-chat-conversation";
import { type ChatMessage, listModels } from "../services/chat-service";

function ChatSidebar(): React.JSX.Element {
	// const [draft, setDraft] = useState("");
	// const [selectedModel, setSelectedModel] = useState<string>();
	// const modelsQuery = useQuery({
	// 	queryKey: ["agent", "models"],
	// 	queryFn: listModels,
	// 	staleTime: 5 * 60 * 1000,
	// });
	//
	// console.log({ models: modelsQuery.data });
	//
	// const chatModels = useMemo(
	// 	() => modelsQuery.data?.filter((m) => m.kind === "chat") ?? [],
	// 	[modelsQuery.data],
	// );

	// useEffect(() => {
	// 	if (!selectedModel && chatModels.length > 0) {
	// 		setSelectedModel(chatModels[0].name);
	// 	}
	// }, [chatModels, selectedModel]);

	// const { visibleMessages, isSending, sendPrompt } = useChatConversation({
	// 	model: selectedModel,
	// });
	//
	// const handleSend = (e: React.FormEvent) => {
	// 	e.preventDefault();
	// 	const prompt = draft.trim();
	// 	if (!prompt || isSending) return;
	// 	setDraft("");
	// 	sendPrompt(prompt, selectedModel);
	// };

	const [messages, setMessages] = useState<any[]>([
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
		<div className="flex h-full flex-col gap-1">
			<div className="grow overflow-y-scroll">
				<AiChat className="min-h-full">
					<AiConversation messages={messages} />
				</AiChat>
			</div>

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
				}}
				value={input}
			/>
		</div>
	);
}

export { ChatSidebar };
