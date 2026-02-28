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
	spaceId?: string;
};

export type AgentModel = {
	name: string;
	kind: "chat" | "embed" | "unknown";
	path: string;
	loaded: boolean;
	sizeBytes?: number;
};

export type BackgroundTaskKind = "explain-selection" | "expand-selection" | "research-selection";

export type BackgroundTaskStatus = "queued" | "running" | "succeeded" | "failed" | "unknown";

export type BackgroundTask = {
	taskId: string;
	kind: BackgroundTaskKind;
	status: BackgroundTaskStatus;
	spaceId: string;
	documentId: string;
	selectionText: string;
	persistInDocument: boolean;
	resultText: string;
	error: string;
	createdAtMs: number;
	updatedAtMs: number;
};

export async function streamChat(messages: ChatMessage[], options: ChatOptions = {}): Promise<StreamEvent> {
	const payload = {
		messages,
		model: options.model,
		temperature: options.temperature,
		max_tokens: options.maxTokens ?? 256,
		spaceId: options.spaceId,
	};
	return invoke<StreamEvent>("agent_chat_stream", payload).catch((error) => ({
		error: error instanceof Error ? error.message : String(error),
	}));
}

export async function listModels(spaceId?: string): Promise<AgentModel[]> {
	const res = await invoke<
		{
			name: string;
			kind: string;
			path: string;
			loaded: boolean;
			size_bytes?: number;
		}[]
	>("agent_list_models", {
		spaceId,
	});

	return res.map((m) => ({
		name: m.name,
		kind: normalizeKind(m.kind),
		path: m.path,
		loaded: m.loaded,
		sizeBytes: m.size_bytes,
	}));
}

export async function runExplainSelection(
	selectionText: string,
	options: {
		model?: string;
		spaceId?: string;
	} = {},
): Promise<string> {
	const trimmed = selectionText.trim();
	if (!trimmed) {
		throw new Error("Selection is required");
	}

	return runQuickActionChat(
		[
			{
				role: "system",
				content: "Explain the selected text clearly and concisely. Avoid filler.",
			},
			{
				role: "user",
				content: trimmed,
			},
		],
		options,
	);
}

export async function runExpandSelection(
	selectionText: string,
	options: {
		model?: string;
		spaceId?: string;
	} = {},
): Promise<string> {
	const trimmed = selectionText.trim();
	if (!trimmed) {
		throw new Error("Selection is required");
	}

	return runQuickActionChat(
		[
			{
				role: "system",
				content:
					"Expand the selected text into richer, accurate prose that can be inserted directly into the document. Use search tools if available in your runtime. Return only the expanded text.",
			},
			{
				role: "user",
				content: trimmed,
			},
		],
		options,
	);
}

export async function enqueueBackgroundTask(input: {
	kind: BackgroundTaskKind;
	spaceId: string;
	documentId: string;
	selectionText: string;
	model?: string;
	persistInDocument?: boolean;
}): Promise<BackgroundTask> {
	const task = await invoke<BackgroundTask>("agent_enqueue_background_task", {
		kind: input.kind,
		spaceId: input.spaceId,
		documentId: input.documentId,
		selectionText: input.selectionText,
		model: input.model,
		persistInDocument: input.persistInDocument ?? false,
	});
	return normalizeBackgroundTask(task);
}

export async function listBackgroundTasks(input: { spaceId?: string; limit?: number } = {}): Promise<BackgroundTask[]> {
	const tasks = await invoke<BackgroundTask[]>("agent_list_background_tasks", {
		spaceId: input.spaceId,
		limit: input.limit ?? 50,
	});
	return tasks.map(normalizeBackgroundTask);
}

async function runQuickActionChat(
	messages: ChatMessage[],
	options: {
		model?: string;
		spaceId?: string;
	},
): Promise<string> {
	const response = await streamChat(messages, {
		model: options.model,
		spaceId: options.spaceId,
		maxTokens: 1_000,
		temperature: 0.2,
	});
	if (response.error) {
		throw new Error(response.error);
	}
	return (response.token ?? "").trim();
}

function normalizeBackgroundTask(task: BackgroundTask): BackgroundTask {
	return {
		...task,
		createdAtMs: Number(task.createdAtMs ?? 0),
		updatedAtMs: Number(task.updatedAtMs ?? 0),
		resultText: task.resultText ?? "",
		error: task.error ?? "",
	};
}

function normalizeKind(kind: string): AgentModel["kind"] {
	const value = kind.toLowerCase();
	if (value.includes("chat")) return "chat";
	if (value.includes("embed")) return "embed";
	return "unknown";
}
