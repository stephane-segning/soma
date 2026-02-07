import type {
	AgentClient,
	AgentModel,
	ChatMessage,
	ChatOptions,
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
}
