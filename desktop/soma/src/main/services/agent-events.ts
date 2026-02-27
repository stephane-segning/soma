import { parseAgentRuntimeEventPayload } from "@soma/desktop-db";
import { BrowserWindow } from "electron";
import type { AgentRuntimeEvent } from "./agent-client";

export class AgentEventsService {
	broadcast(event: AgentRuntimeEvent): void {
		const payload = parseAgentRuntimeEventPayload(event);
		if (!payload) return;
		for (const window of BrowserWindow.getAllWindows()) {
			window.webContents.send("agent_event", payload);
		}
	}
}
