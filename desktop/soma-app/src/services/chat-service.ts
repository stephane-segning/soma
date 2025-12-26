export type ChatMessage = {
	role: "system" | "user" | "assistant";
	content: string;
};
export type StreamEvent = {
	token?: string;
	done?: boolean;
	error?: string;
	ready?: boolean;
};

/**
 * Chat via daemon/agent; expects soma-daemon to forward to the agent service.
 */
import { invoke } from "@tauri-apps/api/core";

export async function streamChat(messages: ChatMessage[]): Promise<StreamEvent> {
	return invoke<StreamEvent>("agent_chat_stream", { messages }).catch((error) => ({
		error: error instanceof Error ? error.message : String(error),
	}));
}
