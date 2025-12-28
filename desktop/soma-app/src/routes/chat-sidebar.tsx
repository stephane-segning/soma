import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { twMerge } from "tailwind-merge";
import { useChatConversation } from "../hooks/use-chat-conversation";
import type { AgentModel, ChatMessage } from "../services/chat-service";
import { listModels } from "../services/chat-service";

function ChatSidebar(): React.JSX.Element {
	const [draft, setDraft] = useState("");
	const [selectedModel, setSelectedModel] = useState<string>();
	const modelsQuery = useQuery({
		queryKey: ["agent", "models"],
		queryFn: listModels,
		staleTime: 5 * 60 * 1000,
	});

	const chatModels = useMemo(
		() => modelsQuery.data?.filter((m) => m.kind === "chat") ?? [],
		[modelsQuery.data],
	);

	useEffect(() => {
		if (!selectedModel && chatModels.length > 0) {
			setSelectedModel(chatModels[0].name);
		}
	}, [chatModels, selectedModel]);

	const { visibleMessages, isSending, sendPrompt } = useChatConversation({
		model: selectedModel,
	});

	const handleSend = (e: React.FormEvent) => {
		e.preventDefault();
		const prompt = draft.trim();
		if (!prompt || isSending) return;
		setDraft("");
		sendPrompt(prompt, selectedModel);
	};

	return (
		<div className="flex h-full flex-col gap-3 p-4">
			<header className="flex items-center justify-between gap-2">
				<div>
					<p className="font-semibold text-base-content text-sm">Chat</p>
					<p className="text-base-content/70 text-xs">
						Ask the local agent (streaming).
					</p>
				</div>
				<div className="flex items-center gap-2">
					<ModelSelect
						models={chatModels}
						disabled={isSending || modelsQuery.isLoading}
						onChange={(val) => setSelectedModel(val)}
						value={selectedModel}
					/>
					<div className="badge badge-outline">Live</div>
				</div>
			</header>

			<div className="card h-full min-h-0 bg-base-100 shadow">
				<div className="card-body flex min-h-0 flex-col gap-3 p-3">
					<div className="scrollbar-thin scrollbar-thumb-base-300 flex-1 space-y-3 overflow-y-auto pr-1">
						{visibleMessages.length === 0 ? (
							<p className="text-base-content/70 text-sm">
								Start a conversation to see responses here.
							</p>
						) : (
							visibleMessages.map((msg, idx) => (
								<ChatBubble key={`${idx}-${msg.role}`} message={msg} />
							))
						)}
					</div>

					<form className="flex flex-col gap-2" onSubmit={handleSend}>
						<textarea
							className="textarea textarea-bordered textarea-sm h-20 w-full resize-none"
							disabled={isSending}
							onChange={(e) => setDraft(e.target.value)}
							placeholder="Ask anything…"
							value={draft}
						/>
						<button
							className={twMerge(
								"btn btn-primary btn-sm w-full",
								isSending && "btn-disabled loading",
							)}
							type="submit"
						>
							Send
						</button>
					</form>
				</div>
			</div>
		</div>
	);
}

function ChatBubble({ message }: { message: ChatMessage }): React.JSX.Element {
	const isUser = message.role === "user";
	const alignment = isUser ? "chat-end" : "chat-start";
	const bubble = isUser ? "chat-bubble-primary" : "chat-bubble-secondary";

	return (
		<div className={twMerge("chat", alignment)}>
			<div className={twMerge("chat-bubble whitespace-pre-wrap", bubble)}>
				{message.content || "..."}
			</div>
		</div>
	);
}

function ModelSelect({
	models,
	value,
	onChange,
	disabled,
}: {
	models: AgentModel[];
	value?: string;
	onChange: (val: string) => void;
	disabled?: boolean;
}): React.JSX.Element {
	if (!models.length) {
		return (
			<div className="badge badge-ghost badge-sm text-xs" title="No chat models available">
				No models
			</div>
		);
	}

	return (
		<select
			className="select select-bordered select-xs min-w-[8rem]"
			disabled={disabled}
			onChange={(e) => onChange(e.target.value)}
			value={value}
		>
			{models.map((m) => (
				<option key={m.name} value={m.name}>
					{m.name}
					{m.loaded ? "" : " (cold)"}
				</option>
			))}
		</select>
	);
}

export { ChatSidebar };
