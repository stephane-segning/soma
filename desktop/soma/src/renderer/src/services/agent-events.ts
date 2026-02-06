type AgentEvent =
	| {
			kind: "ready";
			atMs: number;
			provider: string;
			baseUrl: string;
	  }
	| {
			kind: "status";
			atMs: number;
			provider: string;
			baseUrl: string;
			models: Array<{
				name: string;
			}>;
	  }
	| {
			kind: "error";
			atMs: number;
			provider: string;
			baseUrl: string;
			error: string;
	  };

export function startAgentEventListener(): () => void {
	const apiBridge = typeof window !== "undefined" ? (window as any).api : undefined;
	if (!apiBridge?.onAgentEvent) {
		return () => undefined;
	}

	return apiBridge.onAgentEvent((event: AgentEvent) => {
		if (!event || typeof event.kind !== "string") return;
		if (event.kind === "error") {
			console.warn("agent event error", {
				provider: event.provider,
				baseUrl: event.baseUrl,
				error: event.error,
			});
		}
	});
}
