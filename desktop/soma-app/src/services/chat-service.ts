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

export type ChatOptions = {
	model?: string;
	temperature?: number;
	maxTokens?: number;
};

export async function streamChat(
	messages: ChatMessage[],
	options: ChatOptions = {},
): Promise<StreamEvent> {
	const payload = {
		messages,
		model: options.model,
		temperature: options.temperature,
		max_tokens: options.maxTokens ?? 256,
	};
	return invoke<StreamEvent>("agent_chat_stream", payload).catch((error) => ({
		error: error instanceof Error ? error.message : String(error),
	}));
}
