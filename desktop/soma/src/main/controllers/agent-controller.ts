import {
	AgentClient,
	AgentModel,
	ChatMessage,
	ChatOptions,
	StreamEvent,
} from "../services/agent-client";

export class AgentController {
	constructor(private readonly agent: AgentClient) {}

	chatStream(
		messages: ChatMessage[],
		options: ChatOptions = {},
	): Promise<StreamEvent> {
		return this.agent.chatStream(messages, options);
	}

	listModels(): Promise<AgentModel[]> {
		return this.agent.listModels();
	}
}
