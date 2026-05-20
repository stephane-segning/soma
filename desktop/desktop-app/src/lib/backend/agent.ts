import { call } from "./client";
import type {
	AgentModel,
	BackgroundTask,
	ChatMessage,
	ChatOptions,
	ChatResponse,
	EnqueueBackgroundTaskParams,
	ListBackgroundTasksParams,
	RerankParams,
	RerankResult,
	ResolveDriftParams,
	ResolveDriftResult,
} from "./types";

export const agent = {
	chat: (messages: ChatMessage[], options: ChatOptions = {}) =>
		call<ChatResponse>("agent_chat_stream", { args: { messages, ...options } }),
	listModels: (spaceId?: string) => call<AgentModel[]>("agent_list_models", { spaceId }),
	rerank: (args: RerankParams) => call<RerankResult[]>("agent_rerank", { args }),
	resolveDrift: (args: ResolveDriftParams) => call<ResolveDriftResult>("agent_resolve_drift", { args }),
	enqueueBackgroundTask: (args: EnqueueBackgroundTaskParams) =>
		call<BackgroundTask>("agent_enqueue_background_task", { args }),
	listBackgroundTasks: (args: ListBackgroundTasksParams = {}) =>
		call<BackgroundTask[]>("agent_list_background_tasks", { args }),
};
