/**
 * ChatPanel — the assistant chat surface that lives inside the right
 * rail's "Chat" panel.
 *
 * Composition (all from `@soma/ui`):
 * - `AiChat`         — the scrolling shell
 * - `AiConversation` — message list (uses `AiMessage` + `AiMarkdown` internally)
 * - `AiThinking`     — loading indicator while a response is in flight
 * - `AiInput`        — composer textarea + send button
 * - `BackendSwitcher`— provider picker rendered as the composer chip
 *
 * Data wiring (today): `backend.agent.chat` is the only chat method
 * exposed by the SDK and it is non-streaming — it returns the final
 * `token` once the model finishes. We post the user's transcript, wait
 * for `ChatResponse`, then append a synthetic `ChatMessage` for the
 * assistant. Streaming and `agent_event`-channel deltas are not part of
 * the SDK surface yet; once they land, this component should subscribe
 * via `backend.events.onAgent(...)` and update the in-flight message in
 * place.
 */

import { AiChat } from "@soma/ui/components/chat/ai-chat";
import { AiConversation } from "@soma/ui/components/chat/ai-conversation";
import type { ChatMessage as UiChatMessage } from "@soma/ui/components/chat/ai-message";
import { AiThinking } from "@soma/ui/components/chat/ai-thinking";
import { BackendSwitcher } from "@soma/ui/components/chat/backend-switcher";
import { AiInput } from "@soma/ui/components/forms/ai-input";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { backend } from "../../lib/backend";

type BackendChoice = {
	id: string;
	name: string;
	meta?: string;
};

const BACKENDS: BackendChoice[] = [
	{ id: "ollama", name: "Ollama", meta: "Local · http://127.0.0.1:11434" },
	{ id: "anthropic", name: "Anthropic", meta: "Cloud" },
];

function newId(): string {
	if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
		return crypto.randomUUID();
	}
	return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function ChatPanel(): React.JSX.Element {
	const { t } = useTranslation();
	const [messages, setMessages] = useState<UiChatMessage[]>([]);
	const [draft, setDraft] = useState("");
	const [activeBackend, setActiveBackend] = useState<string>(BACKENDS[0].id);
	const [thinking, setThinking] = useState(false);

	const handleSend = useCallback(async () => {
		const trimmed = draft.trim();
		if (!trimmed || thinking) return;

		const userMessage: UiChatMessage = {
			id: newId(),
			role: "user",
			content: trimmed,
		};
		const nextHistory = [...messages, userMessage];
		setMessages(nextHistory);
		setDraft("");
		setThinking(true);

		try {
			const response = await backend.agent.chat({
				messages: nextHistory.map((m) => ({
					role: m.role === "assistant" ? "assistant" : "user",
					content: m.content,
				})),
				model: null,
				temperature: null,
				maxTokens: null,
				spaceId: null,
			});
			const assistantContent = response.error ? `_${response.error}_` : response.token;
			setMessages((prev) => [
				...prev,
				{
					id: newId(),
					role: "assistant",
					content: assistantContent,
				},
			]);
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			setMessages((prev) => [
				...prev,
				{
					id: newId(),
					role: "assistant",
					content: `_${message}_`,
				},
			]);
		} finally {
			setThinking(false);
		}
	}, [draft, messages, thinking]);

	const isEmpty = messages.length === 0;

	return (
		<AiChat className="h-full" contentClassName="px-2 py-2" maxHeight="100%">
			<div className="flex h-full min-h-0 flex-col gap-2">
				<div className="min-h-0 flex-1 overflow-auto">
					{isEmpty ? (
						<div className="px-3 py-6 text-center text-base-content/50 text-sm">
							{t("panels.chat.empty", "Ask the assistant anything.")}
						</div>
					) : (
						<AiConversation messages={messages} />
					)}
					{thinking ? (
						<div className="px-2 pt-2">
							<AiThinking status="thinking" />
						</div>
					) : null}
				</div>
				<div className="border-base-300 border-t pt-2">
					<AiInput
						modelSelector={
							<BackendSwitcher
								activeId={activeBackend}
								backends={BACKENDS.map((b) => ({
									id: b.id,
									name: b.name,
									meta: b.meta,
								}))}
								onChange={setActiveBackend}
							/>
						}
						onChange={setDraft}
						onSend={handleSend}
						placeholder={t("panels.chat.placeholder", "Message the assistant…")}
						value={draft}
					/>
				</div>
			</div>
		</AiChat>
	);
}
