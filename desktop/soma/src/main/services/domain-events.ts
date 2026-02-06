import { BrowserWindow } from "electron";

export type DomainEvent =
	| {
			kind: "spaces-changed";
	  }
	| {
			kind: "space-changed";
			spaceId: string;
	  }
	| {
			kind: "pages-changed";
			spaceId: string;
	  }
	| {
			kind: "document-changed";
			spaceId: string;
			documentId: string;
	  };

export class DomainEventsService {
	broadcast(event: DomainEvent): void {
		for (const window of BrowserWindow.getAllWindows()) {
			window.webContents.send("domain_event", event);
		}
	}
}
