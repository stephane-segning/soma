import { useChatConversation } from "@soma/hooks/use-chat-conversation.ts";
import { api } from "@soma/store/api";
import { useEffect, useMemo, useState } from "react";
import { AiChat } from "@soma/ui/components/chat/ai-chat";
import { AiConversation } from "@soma/ui/components/chat/ai-conversation";
import { AiInput } from "@soma/ui/components/forms/ai-input";

function ChatSidebar(): React.JSX.Element {
	const { data, error } = api.useListAgentModelsQuery(undefined, {
		// leave cache around; listModels is cheap
		refetchOnMountOrArgChange: false,
	});

	const chatModels = useMemo(
		() => data?.filter((m) => m.kind === "chat") ?? [],
		[data],
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

	if (error) {
		console.error(error);
	}

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
								className="select select-sm select-ghost"
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
