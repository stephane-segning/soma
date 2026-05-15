import type { AgentProvider } from "../agent-config";

export type ChatMessage = {
	role: "system" | "user" | "assistant";
	content: string;
};

export type ChatOptions = {
	model?: string;
	temperature?: number;
	maxTokens?: number;
	spaceId?: string;
};

export type StreamEvent = {
	token?: string;
	done?: boolean;
	error?: string;
	ready?: boolean;
};

export type AgentRuntimeEvent =
	| {
			kind: "ready";
			atMs: number;
			provider: AgentProvider;
			baseUrl: string;
	  }
	| {
			kind: "status";
			atMs: number;
			provider: AgentProvider;
			baseUrl: string;
			models: AgentModel[];
	  }
	| {
			kind: "error";
			atMs: number;
			provider: AgentProvider;
			baseUrl: string;
			error: string;
	  };

export type AgentRuntimeEventHandlers = {
	onEvent: (event: AgentRuntimeEvent) => void;
};

export type AgentModel = {
	name: string;
	kind: "chat" | "embed" | "unknown";
	path: string;
	loaded: boolean;
	sizeBytes?: number;
};

export type RerankCandidate = {
	id: string;
	content: string;
};

export type RerankParams = {
	query: string;
	candidates: RerankCandidate[];
	model?: string;
	topN?: number;
	spaceId?: string;
};

export type RerankResult = {
	id: string;
	score: number;
	rank: number;
};

export type ResolveDriftParams = {
	leftUpdateBase64: string;
	rightUpdateBase64: string;
};

export type ResolveDriftResult = {
	mergedUpdateBase64: string;
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

export type EnqueueBackgroundTaskParams = {
	kind: BackgroundTaskKind;
	spaceId: string;
	documentId: string;
	selectionText: string;
	model?: string;
	persistInDocument?: boolean;
};

export type ListBackgroundTasksParams = {
	spaceId?: string;
	limit?: number;
};
