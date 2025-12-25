import { Observable } from "rxjs";

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };
export type StreamEvent = { token?: string; done?: boolean; error?: string; ready?: boolean };

/**
 * Start a streaming chat request via IPC and return an observable of streamed events.
 * The observable is constructed entirely in the renderer to keep preload thin.
 */
export function streamChat(messages: ChatMessage[]): Observable<StreamEvent> {
	const channel = window.api.agent.chatStream({ messages });

	return new Observable<StreamEvent>((subscriber) => {
		const handler = (
			_event: Electron.IpcRendererEvent,
			message: { channel: string; payload: StreamEvent },
		) => {
			if (message.channel !== channel) return;
			subscriber.next(message.payload);
		};

		window.electron.ipcRenderer.on("ipc:main-event", handler);
		return () => {
			window.electron.ipcRenderer.removeListener("ipc:main-event", handler);
		};
	});
}
