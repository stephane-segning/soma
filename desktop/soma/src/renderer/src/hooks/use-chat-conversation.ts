import { useEffect, useMemo, useRef, useState } from "react";
import { type ChatMessage, streamChat } from "../services/chat-service";

type UseChatConversationOptions = {
	systemPrompt?: string;
	model?: string;
	spaceId?: string;
};

type UseChatConversationResult = {
	messages: ChatMessage[];
	visibleMessages: ChatMessage[];
	isSending: boolean;
	sendPrompt: (prompt: string, model?: string) => void;
	appendMessage: (msg: ChatMessage) => void;
};

export function useChatConversation(options: UseChatConversationOptions = {}): UseChatConversationResult {
	const [messages, setMessages] = useState<ChatMessage[]>(() => {
		const systemPrompt = options.systemPrompt ?? "You’re the Soma assistant. Keep replies short, concise and helpful.";
		return [
			{
				role: "system",
				content: systemPrompt,
			},
		];
	});

	const messagesRef = useRef(messages);

	useEffect(() => {
		messagesRef.current = messages;
	}, [messages]);

	const assistantIdxRef = useRef<number | null>(null);
	const [isSending, setIsSending] = useState(false);

	const sendPrompt = (prompt: string, model?: string) => {
		const trimmed = prompt.trim();
		if (!trimmed || isSending) return;

		const run = async () => {
			setIsSending(true);
			const history: ChatMessage[] = [
				...messagesRef.current,
				{
					role: "user",
					content: trimmed,
				},
			];
			setMessages((prev) => {
				const idx = prev.length + 1;
				assistantIdxRef.current = idx;
				return [
					...prev,
					{
						role: "user",
						content: trimmed,
					},
					{
						role: "assistant",
						content: "",
					},
				];
			});

			try {
				const result = await streamChat(history, {
					model: model ?? options.model,
					spaceId: options.spaceId,
				});
				if (result.error) {
					throw new Error(result.error);
				}
				setMessages((prev) => {
					const next = [...prev];
					const idx = assistantIdxRef.current ?? next.length - 1;
					next[idx] = {
						role: "assistant",
						content: result.token ?? "",
					};
					return next;
				});
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				setMessages((prev) => {
					const next = [...prev];
					const idx = assistantIdxRef.current !== null ? assistantIdxRef.current : Math.max(0, next.length - 1);
					next[idx] = {
						role: "assistant",
						content: `⚠️ ${message}`,
					};
					return next;
				});
			} finally {
				assistantIdxRef.current = null;
				setIsSending(false);
			}
		};

		void run();
	};

	const appendMessage = (msg: ChatMessage) => {
		setMessages((prev) => [...prev, msg]);
	};

	const visibleMessages = useMemo(() => messages.filter((m) => m.role !== "system"), [messages]);

	return {
		messages,
		visibleMessages,
		isSending,
		sendPrompt,
		appendMessage,
	};
}
