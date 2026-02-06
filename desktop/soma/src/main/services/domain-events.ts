import { BrowserWindow } from "electron";
import { parseDomainEventPayload, type DomainEventPayload } from "@soma/desktop-db";

export type DomainEvent = DomainEventPayload;

export class DomainEventsService {
	broadcast(event: DomainEvent): void {
		const payload = parseDomainEventPayload(event);
		if (!payload) return;
		for (const window of BrowserWindow.getAllWindows()) {
			window.webContents.send("domain_event", payload);
		}
	}
}
