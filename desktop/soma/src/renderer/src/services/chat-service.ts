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

import { invoke } from "../lib/ipc";

export type ChatOptions = {
	model?: string;
	temperature?: number;
	maxTokens?: number;
};

export type AgentModel = {
	name: string;
	kind: "chat" | "embed" | "unknown";
	path: string;
	loaded: boolean;
	sizeBytes?: number;
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

export async function listModels(): Promise<AgentModel[]> {
	const res =
		await invoke<
			{
				name: string;
				kind: string;
				path: string;
				loaded: boolean;
				size_bytes?: number;
			}[]
		>("agent_list_models");

	return res.map((m) => ({
		name: m.name,
		kind: normalizeKind(m.kind),
		path: m.path,
		loaded: m.loaded,
		sizeBytes: m.size_bytes,
	}));
}

function normalizeKind(kind: string): AgentModel["kind"] {
	const value = kind.toLowerCase();
	if (value.includes("chat")) return "chat";
	if (value.includes("embed")) return "embed";
	return "unknown";
}
