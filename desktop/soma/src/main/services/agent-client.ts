import type { AddonRuntime } from "./addon-runtime";
import {
	type BackgroundTaskStore,
	backgroundTaskMessages,
	enqueueBackgroundTask,
	listBackgroundTasks,
	updateBackgroundTask,
} from "./agent-client/background-tasks";
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

/**
 * Agent-facing facade. Chat / list-models / rerank still go through the
 * configured OpenAI-compatible HTTP endpoint (Ollama or remote). Drift
 * resolution moves to the in-process addon, which embeds the yrs merger.
 */
export class AgentClient {
	private readonly readConfig: () => ReturnType<typeof normalizeAgentRuntimeConfig>;
	private readonly backgroundTasks: BackgroundTaskStore = new Map();

	constructor(
		private readonly runtime: AddonRuntime,
		readConfig?: () => unknown,
	) {
		this.readConfig = () => normalizeAgentRuntimeConfig(readConfig?.());
	}

	async chatStream(messages: ChatMessage[], options: ChatOptions = {}): Promise<StreamEvent> {
		const config = this.resolveRuntimeConfig(options.spaceId);
		try {
			return await chatStreamViaOpenAi(messages, options, config);
		} catch (error) {
			return { error: error instanceof Error ? error.message : String(error) };
		}
	}

	async listModels(spaceId?: string): Promise<AgentModel[]> {
		return listModelsViaOpenAi(this.resolveRuntimeConfig(spaceId));
	}

	async rerank(params: RerankParams): Promise<RerankResult[]> {
		this.validateRerank(params);
		return rerankViaOpenAi(params, this.resolveRuntimeConfig(params.spaceId));
	}

	async resolveDrift(params: ResolveDriftParams): Promise<ResolveDriftResult> {
		if (!params.leftUpdateBase64?.trim()) throw new Error("leftUpdateBase64 is required");
		if (!params.rightUpdateBase64?.trim()) throw new Error("rightUpdateBase64 is required");

		const handle = await this.handle();
		const merged = await handle.resolveDrift(
			Buffer.from(params.leftUpdateBase64, "base64"),
			Buffer.from(params.rightUpdateBase64, "base64"),
		);
		return {
			mergedUpdateBase64: Buffer.from(merged).toString("base64"),
		};
	}

	enqueueBackgroundTask(params: EnqueueBackgroundTaskParams): Promise<BackgroundTask> {
		return enqueueBackgroundTask(this.backgroundTasks, params, (taskId, model) => {
			void this.runBackgroundTask(taskId, model);
		});
	}

	listBackgroundTasks(params: ListBackgroundTasksParams = {}): Promise<BackgroundTask[]> {
		return Promise.resolve(listBackgroundTasks(this.backgroundTasks, params));
	}

	startEventStream(handlers: AgentRuntimeEventHandlers): () => void {
		return startAgentRuntimeEventStream({
			handlers,
			listModels: () => this.listModels(),
			resolveConfig: () => this.resolveRuntimeConfig(),
		});
	}

	private async runBackgroundTask(taskId: string, model?: string): Promise<void> {
		const task = this.backgroundTasks.get(taskId);
		if (!task) return;

		updateBackgroundTask(this.backgroundTasks, taskId, { status: "running", error: "" });
		try {
			const response = await chatStreamViaOpenAi(
				backgroundTaskMessages(task),
				{
					model,
					maxTokens: 1_200,
					temperature: task.kind === "research-selection" ? 0.3 : 0.2,
					spaceId: task.spaceId,
				},
				this.resolveRuntimeConfig(task.spaceId),
			);
			if (response.error) throw new Error(response.error);
			updateBackgroundTask(this.backgroundTasks, taskId, {
				status: "succeeded",
				resultText: (response.token ?? "").trim(),
			});
		} catch (error) {
			updateBackgroundTask(this.backgroundTasks, taskId, {
				status: "failed",
				error: error instanceof Error ? error.message : String(error),
			});
		}
	}

	private resolveRuntimeConfig(spaceId?: string): ReturnType<typeof resolveWorkspaceAgentConfig> {
		return resolveWorkspaceAgentConfig(this.readConfig(), spaceId);
	}

	private validateRerank(params: RerankParams): void {
		if (!params.query?.trim()) throw new Error("query is required");
		if (!params.candidates?.length) throw new Error("at least one candidate is required");
	}

	private async handle() {
		// `AddonRuntime.start()` is idempotent.
		return this.runtime.start();
	}
}
