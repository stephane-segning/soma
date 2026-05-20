/**
 * Renderer-side agent service. Thin adapter over `@soma/sdk`'s
 * `backend.agent.*` surface — no IPC channel names live here anymore.
 *
 * Migration note: the previous implementation sent `max_tokens`
 * (snake_case) on the wire but the Electron HTTP client read
 * `options.maxTokens` (camelCase), so the caller's `maxTokens` override
 * was silently lost. The SDK uses camelCase end-to-end (the Rust side
 * accepts both via `#[serde(alias)]`), so the override now actually
 * takes effect.
 */

import type {
	AgentModel as SdkAgentModel,
	BackgroundTask as SdkBackgroundTask,
	BackgroundTaskKind as SdkBackgroundTaskKind,
	BackgroundTaskStatus as SdkBackgroundTaskStatus,
	ChatMessage as SdkChatMessage,
	ChatResponse,
} from "@soma/sdk";
import { backend } from "../lib/ipc";

export type ChatMessage = SdkChatMessage;
export type AgentModel = SdkAgentModel;
export type BackgroundTaskKind = SdkBackgroundTaskKind;
export type BackgroundTaskStatus = SdkBackgroundTaskStatus;
export type BackgroundTask = SdkBackgroundTask;

export type ChatOptions = {
	model?: string;
	temperature?: number;
	maxTokens?: number;
	spaceId?: string;
};

/**
 * Single-shot chat response. Tracks the SDK's `ChatResponse` but exposes
 * the legacy `token` / `done` / `error` / `ready` superset so existing
 * consumers don't need an edit.
 */
export type StreamEvent = {
	token?: string;
	done?: boolean;
	error?: string;
	ready?: boolean;
};

export async function streamChat(messages: ChatMessage[], options: ChatOptions = {}): Promise<StreamEvent> {
	try {
		const response: ChatResponse = await backend.agent.chat({
			messages,
			model: options.model ?? null,
			temperature: options.temperature ?? null,
			maxTokens: options.maxTokens ?? null,
			spaceId: options.spaceId ?? null,
		});
		if (response.error) return { error: response.error };
		return { token: response.token, done: response.done };
	} catch (error) {
		return { error: error instanceof Error ? error.message : String(error) };
	}
}

export async function listModels(spaceId?: string): Promise<AgentModel[]> {
	return backend.agent.listModels(spaceId ?? null);
}

export async function runExplainSelection(
	selectionText: string,
	options: { model?: string; spaceId?: string } = {},
): Promise<string> {
	const trimmed = selectionText.trim();
	if (!trimmed) {
		throw new Error("Selection is required");
	}
	return runQuickActionChat(
		[
			{ role: "system", content: "Explain the selected text clearly and concisely. Avoid filler." },
			{ role: "user", content: trimmed },
		],
		options,
	);
}

export async function runExpandSelection(
	selectionText: string,
	options: { model?: string; spaceId?: string } = {},
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
			{ role: "user", content: trimmed },
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
	const task = await backend.agent.enqueueBackgroundTask({
		kind: input.kind,
		spaceId: input.spaceId,
		documentId: input.documentId,
		selectionText: input.selectionText,
		model: input.model ?? null,
		persistInDocument: input.persistInDocument ?? false,
	});
	return normalizeBackgroundTask(task);
}

export async function listBackgroundTasks(input: { spaceId?: string; limit?: number } = {}): Promise<BackgroundTask[]> {
	const tasks = await backend.agent.listBackgroundTasks({
		spaceId: input.spaceId ?? null,
		limit: input.limit ?? 50,
	});
	return tasks.map(normalizeBackgroundTask);
}

async function runQuickActionChat(
	messages: ChatMessage[],
	options: { model?: string; spaceId?: string },
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

/**
 * Defensive coercion: numbers can arrive as strings under some IPC
 * paths, and `resultText`/`error` are optional on partial responses.
 */
function normalizeBackgroundTask(task: BackgroundTask): BackgroundTask {
	return {
		...task,
		createdAtMs: Number(task.createdAtMs ?? 0),
		updatedAtMs: Number(task.updatedAtMs ?? 0),
		resultText: task.resultText ?? "",
		error: task.error ?? "",
	};
}
