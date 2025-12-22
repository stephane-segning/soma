import log from "electron-log";
import { injectable } from "inversify";

type InlineAiInput = { prompt: string; context?: string };

@injectable()
class AgentService {
	private readonly logger = log.scope("agent-service");

	async inlineComplete(input: InlineAiInput): Promise<{ completion: string }> {
		const prompt = (input.prompt ?? "").trim();
		if (!prompt) return { completion: "" };

		// Best-effort attempt to reach agentd over HTTP if configured.
		const agentUrl = process.env.SOMA_AGENTD_HTTP?.trim();
		if (agentUrl) {
			try {
				const res = await fetch(`${agentUrl}/inline`, {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ prompt, context: input.context ?? "" }),
				});
				if (res.ok) {
					const json = (await res.json()) as { completion?: string };
					if (json?.completion) {
						return { completion: json.completion };
					}
				}
			} catch (error) {
				this.logger.warn("agentd inline call failed, falling back", error);
			}
		}

		// Local fallback keeps the UI usable even without agentd.
		return { completion: `AI: ${prompt}` };
	}
}

export { AgentService };
export type { InlineAiInput };
