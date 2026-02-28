import type {
	AgentClient,
	AgentModel,
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
} from "../services/agent-client";

export class AgentController {
	constructor(private readonly agent: AgentClient) {}

	chatStream(messages: ChatMessage[], options: ChatOptions = {}): Promise<StreamEvent> {
		return this.agent.chatStream(messages, options);
	}

	listModels(spaceId?: string): Promise<AgentModel[]> {
		return this.agent.listModels(spaceId);
	}

	rerank(params: RerankParams): Promise<RerankResult[]> {
		return this.agent.rerank(params);
	}

	resolveDrift(params: ResolveDriftParams): Promise<ResolveDriftResult> {
		return this.agent.resolveDrift(params);
	}

	enqueueBackgroundTask(params: EnqueueBackgroundTaskParams): Promise<BackgroundTask> {
		return this.agent.enqueueBackgroundTask(params);
	}

	listBackgroundTasks(params: ListBackgroundTasksParams): Promise<BackgroundTask[]> {
		return this.agent.listBackgroundTasks(params);
	}
}
