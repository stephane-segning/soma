import type { ResolvedWorkspaceAgentConfig } from "../agent-config";
import type { AgentModel, AgentRuntimeEventHandlers } from "./types";

type RuntimeEventStreamOptions = {
	handlers: AgentRuntimeEventHandlers;
	listModels: () => Promise<AgentModel[]>;
	resolveConfig: () => ResolvedWorkspaceAgentConfig;
};

export function startAgentRuntimeEventStream(options: RuntimeEventStreamOptions): () => void {
	let stopped = false;
	let timer: NodeJS.Timeout | null = null;
	let emittedReady = false;

	const run = async () => {
		if (stopped) return;
		const config = options.resolveConfig();
		const baseUrl = config.openAiBaseUrl;
		try {
			const models = await options.listModels();
			if (!emittedReady) {
				options.handlers.onEvent({
					kind: "ready",
					atMs: Date.now(),
					provider: config.provider,
					baseUrl,
				});
				emittedReady = true;
			}
			options.handlers.onEvent({
				kind: "status",
				atMs: Date.now(),
				provider: config.provider,
				baseUrl,
				models,
			});
		} catch (error) {
			options.handlers.onEvent({
				kind: "error",
				atMs: Date.now(),
				provider: config.provider,
				baseUrl,
				error: error instanceof Error ? error.message : String(error),
			});
		} finally {
			if (stopped) return;
			timer = setTimeout(run, Math.max(1_000, config.pollIntervalMs));
		}
	};

	void run();

	return () => {
		stopped = true;
		if (timer) {
			clearTimeout(timer);
			timer = null;
		}
	};
}
