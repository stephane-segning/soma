import type * as B from "../bindings";
import type { Transport } from "../transport";

export function agent(t: Transport) {
	return {
		chat: (args: B.ChatStreamArgs) => t.invoke<B.ChatResponse>("agent_chat_stream", { args }),
		listModels: (spaceId: string | null = null) => t.invoke<B.AgentModel[]>("agent_list_models", { spaceId }),
		rerank: (args: B.RerankParams) => t.invoke<B.RerankResult[]>("agent_rerank", { args }),
		resolveDrift: (args: B.ResolveDriftParams) => t.invoke<B.ResolveDriftResult>("agent_resolve_drift", { args }),
		enqueueBackgroundTask: (args: B.EnqueueBackgroundTaskParams) =>
			t.invoke<B.BackgroundTask>("agent_enqueue_background_task", { args }),
		listBackgroundTasks: (args: B.ListBackgroundTasksParams | null = null) =>
			t.invoke<B.BackgroundTask[]>("agent_list_background_tasks", { args }),
	};
}
