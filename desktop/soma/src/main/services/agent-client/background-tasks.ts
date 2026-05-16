import { createId } from "@paralleldrive/cuid2";
import type { BackgroundTask, ChatMessage, EnqueueBackgroundTaskParams, ListBackgroundTasksParams } from "./types";

export type BackgroundTaskStore = Map<string, BackgroundTask>;

export async function enqueueBackgroundTask(
	store: BackgroundTaskStore,
	params: EnqueueBackgroundTaskParams,
	run: (taskId: string, model?: string) => void,
): Promise<BackgroundTask> {
	validateBackgroundTask(params);
	const now = Date.now();
	const task: BackgroundTask = {
		taskId: createId(),
		kind: params.kind,
		status: "queued",
		spaceId: params.spaceId,
		documentId: params.documentId,
		selectionText: params.selectionText,
		persistInDocument: params.persistInDocument ?? false,
		resultText: "",
		error: "",
		createdAtMs: now,
		updatedAtMs: now,
	};
	store.set(task.taskId, task);
	run(task.taskId, params.model);
	return { ...task };
}

export function listBackgroundTasks(
	store: BackgroundTaskStore,
	params: ListBackgroundTasksParams = {},
): BackgroundTask[] {
	const limit = Math.max(1, params.limit ?? 50);
	return Array.from(store.values())
		.filter((task) => !params.spaceId || task.spaceId === params.spaceId)
		.sort((left, right) => right.createdAtMs - left.createdAtMs)
		.slice(0, limit)
		.map((task) => ({ ...task }));
}

export function updateBackgroundTask(store: BackgroundTaskStore, taskId: string, patch: Partial<BackgroundTask>): void {
	const task = store.get(taskId);
	if (!task) return;
	store.set(taskId, {
		...task,
		...patch,
		updatedAtMs: Date.now(),
	});
}

export function backgroundTaskMessages(task: BackgroundTask): ChatMessage[] {
	const selection = task.selectionText.trim();
	switch (task.kind) {
		case "explain-selection":
			return [
				{ role: "system", content: "Explain the selected text clearly and concisely. Avoid filler." },
				{ role: "user", content: selection },
			];
		case "expand-selection":
			return [
				{
					role: "system",
					content:
						"Expand the selected text into richer, accurate prose that can be inserted directly into the document. Return only the expanded text.",
				},
				{ role: "user", content: selection },
			];
		case "research-selection":
			return [
				{
					role: "system",
					content:
						"Research and synthesize the selected text using the configured model provider. Return concise findings, useful context, and any uncertainty. Do not claim external web access unless the provider actually has it.",
				},
				{ role: "user", content: selection },
			];
	}
}

function validateBackgroundTask(params: EnqueueBackgroundTaskParams): void {
	if (!params.spaceId?.trim()) throw new Error("spaceId is required");
	if (!params.documentId?.trim()) throw new Error("documentId is required");
	if (!params.selectionText?.trim()) throw new Error("selectionText is required");
}
