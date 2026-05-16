import type { IpcMain } from "electron";
import type { CommandRegistryContext } from "./types";

export function registerAgentHandlers(ipc: IpcMain, context: CommandRegistryContext): void {
	ipc.handle("agent_chat_stream", (_event, params) => context.agent.chatStream(params?.messages ?? [], params ?? {}));
	ipc.handle("agent_list_models", (_event, params) => context.agent.listModels(params?.spaceId ?? params?.workspaceId));
	ipc.handle("agent_rerank", (_event, params) =>
		context.agent.rerank({
			query: params?.query ?? "",
			candidates: params?.candidates ?? [],
			model: params?.model,
			topN: params?.topN ?? params?.top_n ?? 0,
			spaceId: params?.spaceId ?? params?.workspaceId,
		}),
	);
	ipc.handle("agent_resolve_drift", (_event, params) =>
		context.agent.resolveDrift({
			leftUpdateBase64: params?.leftUpdateBase64 ?? params?.left_update_base64 ?? "",
			rightUpdateBase64: params?.rightUpdateBase64 ?? params?.right_update_base64 ?? "",
		}),
	);
	ipc.handle("agent_enqueue_background_task", (_event, params) =>
		context.agent.enqueueBackgroundTask({
			kind: params?.kind ?? "research-selection",
			spaceId: params?.spaceId ?? params?.workspaceId ?? "",
			documentId: params?.documentId ?? params?.docId ?? "",
			selectionText: params?.selectionText ?? "",
			model: params?.model,
			persistInDocument: params?.persistInDocument ?? false,
		}),
	);
	ipc.handle("agent_list_background_tasks", (_event, params) =>
		context.agent.listBackgroundTasks({
			spaceId: params?.spaceId ?? params?.workspaceId,
			limit: params?.limit ?? 50,
		}),
	);
	ipc.handle("search", (_event, params) => context.search.search(params?.query ?? ""));
}
