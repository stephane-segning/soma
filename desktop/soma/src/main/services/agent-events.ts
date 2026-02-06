import { BrowserWindow } from "electron";
import type { AgentRuntimeEvent } from "./agent-client";

export class AgentEventsService {
	broadcast(event: AgentRuntimeEvent): void {
		for (const window of BrowserWindow.getAllWindows()) {
			window.webContents.send("agent_event", event);
		}
	}
}
