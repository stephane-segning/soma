import { backend } from "@app/lib/ipc";
import { parseAgentRuntimeEventPayload } from "@soma/desktop-db";

export function startAgentEventListener(): () => void {
	return backend.events.onAgent((event) => {
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
