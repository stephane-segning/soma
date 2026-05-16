import {
	type ModelInfo,
	ModelKind,
	type BackgroundTask as ProtoBackgroundTask,
	BackgroundTaskKind as ProtoBackgroundTaskKind,
	BackgroundTaskStatus as ProtoBackgroundTaskStatus,
} from "@soma/proto/agent/v1/agent";

import type { AgentModel, BackgroundTask, BackgroundTaskKind, BackgroundTaskStatus } from "./types";

export function mapModelInfo(model: ModelInfo): AgentModel {
	return {
		name: model.name,
		kind: normalizeKind(model.kind),
		path: model.path,
		loaded: !!model.loaded,
		sizeBytes: model.sizeBytes ? Number(model.sizeBytes) : undefined,
	};
}

export function normalizeKind(kind: ModelKind): AgentModel["kind"] {
	if (kind === ModelKind.MODEL_KIND_CHAT) return "chat";
	if (kind === ModelKind.MODEL_KIND_EMBED) return "embed";
	return "unknown";
}

export function toProtoTaskKind(kind: BackgroundTaskKind): ProtoBackgroundTaskKind {
	switch (kind) {
		case "explain-selection":
			return ProtoBackgroundTaskKind.BACKGROUND_TASK_KIND_EXPLAIN_SELECTION;
		case "expand-selection":
			return ProtoBackgroundTaskKind.BACKGROUND_TASK_KIND_EXPAND_SELECTION;
		case "research-selection":
			return ProtoBackgroundTaskKind.BACKGROUND_TASK_KIND_RESEARCH_SELECTION;
	}
}

export function mapBackgroundTask(task: ProtoBackgroundTask): BackgroundTask {
	return {
		taskId: task.taskId,
		kind: fromProtoTaskKind(task.kind),
		status: fromProtoTaskStatus(task.status),
		spaceId: task.spaceId,
		documentId: task.documentId,
		selectionText: task.selectionText,
		persistInDocument: task.persistInDocument,
		resultText: task.resultText,
		error: task.error,
		createdAtMs: Number(task.createdAtMs ?? 0),
		updatedAtMs: Number(task.updatedAtMs ?? 0),
	};
}

function fromProtoTaskKind(kind: ProtoBackgroundTaskKind): BackgroundTaskKind {
	switch (kind) {
		case ProtoBackgroundTaskKind.BACKGROUND_TASK_KIND_EXPLAIN_SELECTION:
			return "explain-selection";
		case ProtoBackgroundTaskKind.BACKGROUND_TASK_KIND_EXPAND_SELECTION:
			return "expand-selection";
		case ProtoBackgroundTaskKind.BACKGROUND_TASK_KIND_RESEARCH_SELECTION:
		default:
			return "research-selection";
	}
}

function fromProtoTaskStatus(status: ProtoBackgroundTaskStatus): BackgroundTaskStatus {
	switch (status) {
		case ProtoBackgroundTaskStatus.BACKGROUND_TASK_STATUS_QUEUED:
			return "queued";
		case ProtoBackgroundTaskStatus.BACKGROUND_TASK_STATUS_RUNNING:
			return "running";
		case ProtoBackgroundTaskStatus.BACKGROUND_TASK_STATUS_SUCCEEDED:
			return "succeeded";
		case ProtoBackgroundTaskStatus.BACKGROUND_TASK_STATUS_FAILED:
			return "failed";
		default:
			return "unknown";
	}
}
