import {
	chatStreamViaAgentd,
	listModelsViaAgentd,
	rerankViaAgentd,
	resolveDriftViaAgentd,
} from "./agent-client/agentd";
import { createAgentGrpcClient, type AgentGrpcClient } from "./agent-client/connection";
import { enqueueBackgroundTask, listBackgroundTasks } from "./agent-client/background-tasks";
import { chatStreamViaOpenAi, listModelsViaOpenAi, rerankViaOpenAi } from "./agent-client/openai";
import { startAgentRuntimeEventStream } from "./agent-client/runtime-events";
import type {
	AgentModel,
	AgentRuntimeEventHandlers,
	BackgroundTask,
	ChatMessage,
	ChatOptions,
	EnqueueBackgroundTaskParams,
	ListBackgroundTasksParams,
	RerankParams,
	RerankResult,
	ResolveDriftParams,
	ResolveDriftResult,
	StreamEvent,
} from "./agent-client/types";
import { normalizeAgentRuntimeConfig, resolveWorkspaceAgentConfig } from "./agent-config";

export * from "./agent-client/types";

export class AgentClient {
	private client: AgentGrpcClient;
	private readonly readConfig: () => ReturnType<typeof normalizeAgentRuntimeConfig>;

	constructor(socketPath: string, readConfig?: () => unknown) {
		this.client = createAgentGrpcClient(socketPath);
		this.readConfig = () => normalizeAgentRuntimeConfig(readConfig?.());
	}

	async chatStream(messages: ChatMessage[], options: ChatOptions = {}): Promise<StreamEvent> {
		const config = this.resolveRuntimeConfig(options.spaceId);
		try {
			if (config.provider === "agentd") {
				return await chatStreamViaAgentd(this.client, messages, options);
			}
			return await chatStreamViaOpenAi(messages, options, config);
		} catch (error) {
			return {
				error: error instanceof Error ? error.message : String(error),
			};
		}
	}

	async listModels(spaceId?: string): Promise<AgentModel[]> {
		const config = this.resolveRuntimeConfig(spaceId);
		if (config.provider === "agentd") {
			return listModelsViaAgentd(this.client);
		}
		return listModelsViaOpenAi(config);
	}

	async rerank(params: RerankParams): Promise<RerankResult[]> {
		const config = this.resolveRuntimeConfig(params.spaceId);
		this.validateRerank(params);
		if (config.provider === "agentd") {
			return rerankViaAgentd(this.client, params);
		}
		return rerankViaOpenAi(params, config);
	}

	async resolveDrift(params: ResolveDriftParams): Promise<ResolveDriftResult> {
		return resolveDriftViaAgentd(this.client, params);
	}

	enqueueBackgroundTask(params: EnqueueBackgroundTaskParams): Promise<BackgroundTask> {
		return enqueueBackgroundTask(this.client, params);
	}

	listBackgroundTasks(params: ListBackgroundTasksParams = {}): Promise<BackgroundTask[]> {
		return listBackgroundTasks(this.client, params);
	}

	startEventStream(handlers: AgentRuntimeEventHandlers): () => void {
		return startAgentRuntimeEventStream({
			handlers,
			listModels: () => this.listModels(),
			resolveConfig: () => this.resolveRuntimeConfig(),
		});
	}

	private resolveRuntimeConfig(spaceId?: string): ReturnType<typeof resolveWorkspaceAgentConfig> {
		return resolveWorkspaceAgentConfig(this.readConfig(), spaceId);
	}

	private validateRerank(params: RerankParams): void {
		if (!params.query?.trim()) {
			throw new Error("query is required");
		}
		if (!params.candidates?.length) {
			throw new Error("at least one candidate is required");
		}
	}
}
