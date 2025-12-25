import log from "electron-log";
import { inject, injectable } from "inversify";
import { TYPES } from "../tokens";
import type { AgentdClient } from "./agentd-client";

type InlineAiInput = { prompt: string; context?: string };

@injectable()
class AgentService {
	private readonly logger = log.scope("agent-service");

	constructor(
		@inject(TYPES.agentdClient) private readonly agentd: AgentdClient,
	) {}

	async inlineComplete(input: InlineAiInput): Promise<{ completion: string }> {
		const prompt = (input.prompt ?? "").trim();
		if (!prompt) return { completion: "" };

		try {
			const res = await this.agentd.inlineComplete({
				prompt,
				context: input.context ?? "",
			});
			if (res.completion) return { completion: res.completion };
		} catch (error) {
			this.logger.warn("agentd inline call failed, falling back", error);
		}

		// Local fallback keeps the UI usable even without agentd.
		return { completion: `AI: ${prompt}` };
	}

	async chat(input: {
		messages: Array<{ role: string; content: string }>;
		model?: string;
		temperature?: number;
		maxTokens?: number;
	}): Promise<{ content: string; model: string }> {
		return this.agentd.chat(input);
	}

	async embed(input: {
		input: string[];
		model?: string;
	}): Promise<{ embeddings: number[][] }> {
		const embeddings = await this.agentd.embed(input);
		return { embeddings };
	}

	async chatStream(input: {
		messages: Array<{ role: string; content: string }>;
		model?: string;
		temperature?: number;
		maxTokens?: number;
	}) {
		return this.agentd.chatStream(input);
	}
}

export { AgentService };
export type { InlineAiInput };
