import { useChatConversation } from "@soma/hooks/use-chat-conversation.ts";
import { listModels } from "@soma/services/chat-service.ts";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { AiChat } from "soma-ui/components/chat/ai-chat";
import { AiConversation } from "soma-ui/components/chat/ai-conversation";
import { AiInput } from "soma-ui/components/forms/ai-input";

function ChatSidebar(): React.JSX.Element {
	const modelsQuery = useQuery({
		queryKey: ["agent", "models"],
		queryFn: listModels,
		staleTime: 5 * 60 * 1000,
	});

	const chatModels = useMemo(
		() => modelsQuery.data?.filter((m) => m.kind === "chat") ?? [],
		[modelsQuery.data],
	);

	const [selectedModel, setSelectedModel] = useState<string>(
		() => chatModels?.[0]?.name,
	);
	const [draft, setDraft] = useState("");

	useEffect(() => {
		if (!selectedModel && chatModels.length > 0) {
			setSelectedModel(chatModels[0].name);
		}
	}, [chatModels, selectedModel]);

	const { visibleMessages, isSending, sendPrompt } = useChatConversation({
		model: selectedModel,
	});

	const handleSend = () => {
		const prompt = draft.trim();
		if (!prompt || isSending) return;
		setDraft(() => "");
		sendPrompt(prompt, selectedModel);
	};

	return (
		<div className="flex h-full flex-col gap-1 text-sm antialiased">
			<div className="grow overflow-y-scroll">
				<AiChat className="min-h-full">
					<AiConversation messages={visibleMessages as any} />
				</AiChat>
			</div>

			<AiInput
				className="border-base-300 border-t pb-2"
				modelSelector={
					<>
						{chatModels.length > 0 && (
							<select
								className="select select-sm"
								defaultValue="Pick a font"
								onChange={(e) => setSelectedModel(e.target.value)}
							>
								{chatModels.map((a) => (
									<option id={a.name} key={a.name}>
										{a.name}
									</option>
								))}
							</select>
						)}

						{!chatModels.length && <span className="text-sm">No models</span>}
					</>
				}
				onChange={setDraft}
				onSend={handleSend}
				textareaProps={{ maxRows: 8 }}
				value={draft}
			/>
		</div>
	);
}

export { ChatSidebar };
