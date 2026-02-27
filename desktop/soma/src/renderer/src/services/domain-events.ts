import { applyRemoteMailboxPolicy } from "@app/lib/document-mailbox";
import { api } from "@app/store/api";
import { store } from "@app/store/store";
import { type DomainEventPayload, parseDomainEventPayload } from "@soma/desktop-db";
import { getDraft } from "./documents-service";

type DomainEventHandler = (event: DomainEventPayload) => void;

function handleDomainEvent(event: DomainEventPayload): void {
	switch (event.kind) {
		case "spaces-changed":
			store.dispatch(api.util.invalidateTags([{ type: "Spaces", id: "LIST" }]));
			return;
		case "space-changed":
			store.dispatch(
				api.util.invalidateTags([
					{ type: "Space", id: event.spaceId },
					{ type: "SpaceMembers", id: event.spaceId },
					{ type: "Pages", id: event.spaceId },
				]),
			);
			return;
		case "pages-changed":
			store.dispatch(api.util.invalidateTags([{ type: "Pages", id: event.spaceId }]));
			return;
		case "document-changed":
			store.dispatch(api.util.invalidateTags([{ type: "Draft", id: `${event.spaceId}:${event.documentId}` }]));
			if (event.source === "daemon") {
				void handleRemoteDocumentChanged(event);
			}
			return;
	}
}

async function handleRemoteDocumentChanged(
	event: Extract<DomainEventPayload, { kind: "document-changed" }>,
): Promise<void> {
	try {
		const draft = await getDraft({
			spaceId: event.spaceId,
			documentId: event.documentId,
		});
		if (!draft) return;

		const action = applyRemoteMailboxPolicy({
			spaceId: event.spaceId,
			pageId: event.documentId,
			daemonUpdatedAtMs: draft.updatedAtMs,
		});

		if (action === "kept_local_ahead") {
			console.info("remote page changed while local mailbox is ahead", {
				spaceId: event.spaceId,
				documentId: event.documentId,
				reason: event.reason,
			});
		}
	} catch {
		// best-effort conflict handling
	}
}

export function startDomainEventListener(): () => void {
	const apiBridge = typeof window !== "undefined" ? (window as any).api : undefined;
	if (!apiBridge?.onDomainEvent) {
		return () => undefined;
	}

	const handler: DomainEventHandler = (event) => {
		const parsed = parseDomainEventPayload(event);
		if (!parsed) return;
		handleDomainEvent(parsed);
	};

	return apiBridge.onDomainEvent(handler);
}
