import { type AgentRuntimeEventPayload, parseAgentRuntimeEventPayload } from "@soma/desktop-db";

export function startAgentEventListener(): () => void {
	const apiBridge = typeof window !== "undefined" ? (window as any).api : undefined;
	if (!apiBridge?.onAgentEvent) {
		return () => undefined;
	}

	return apiBridge.onAgentEvent((event: AgentRuntimeEventPayload) => {
		const parsed = parseAgentRuntimeEventPayload(event);
		if (!parsed) return;
		if (parsed.kind === "error") {
			console.warn("agent event error", {
				provider: parsed.provider,
				baseUrl: parsed.baseUrl,
				error: parsed.error,
			});
		}
	});
}
