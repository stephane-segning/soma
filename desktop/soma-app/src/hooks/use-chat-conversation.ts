import { useMutation } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { type ChatMessage, streamChat } from "../services/chat-service";

type UseChatConversationOptions = {
	systemPrompt?: string;
};

type UseChatConversationResult = {
	messages: ChatMessage[];
	visibleMessages: ChatMessage[];
	isSending: boolean;
	sendPrompt: (prompt: string) => void;
	appendMessage: (msg: ChatMessage) => void;
};

export function useChatConversation(
	options: UseChatConversationOptions = {},
): UseChatConversationResult {
	const [messages, setMessages] = useState<ChatMessage[]>(() => {
		const systemPrompt =
			options.systemPrompt ??
			"You’re the Soma assistant. Keep replies concise and helpful.";
		return [{ role: "system", content: systemPrompt }];
	});
	const messagesRef = useRef(messages);
	useEffect(() => {
		messagesRef.current = messages;
	}, [messages]);

	const assistantIdxRef = useRef<number | null>(null);

	const mutation = useMutation({
		mutationFn: async (prompt: string) => {
			const history: ChatMessage[] = [
				...messagesRef.current,
				{ role: "user", content: prompt },
			];
			setMessages((prev) => {
				const idx = prev.length + 1;
				assistantIdxRef.current = idx;
				return [
					...prev,
					{ role: "user", content: prompt },
					{ role: "assistant", content: "" },
				];
			});

			const stream$ = streamChat(history);
			return null;
		},
		onSettled: () => {
			assistantIdxRef.current = null;
		},
		onError: (error) => {
			const message = error instanceof Error ? error.message : String(error);
			setMessages((prev) => {
				const next = [...prev];
				const idx =
					assistantIdxRef.current !== null
						? assistantIdxRef.current
						: Math.max(0, next.length - 1);
				next[idx] = {
					role: "assistant",
					content: `⚠️ ${message}`,
				};
				return next;
			});
		},
	});

	const sendPrompt = (prompt: string) => {
		const trimmed = prompt.trim();
		if (!trimmed || mutation.isPending) return;
		mutation.mutate(trimmed);
	};

	const appendMessage = (msg: ChatMessage) => {
		setMessages((prev) => [...prev, msg]);
	};

	const visibleMessages = useMemo(
		() => messages.filter((m) => m.role !== "system"),
		[messages],
	);

	return {
		messages,
		visibleMessages,
		isSending: mutation.isPending,
		sendPrompt,
		appendMessage,
	};
}
