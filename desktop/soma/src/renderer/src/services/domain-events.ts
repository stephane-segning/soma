import { applyRemoteMailboxPolicy } from "@app/lib/document-mailbox";
import { backend } from "@app/lib/ipc";
import { api } from "@app/store/api";
import { store } from "@app/store/store";
import { type DomainEventPayload, parseDomainEventPayload } from "@soma/desktop-db";
import { getDraft } from "./documents-service";

function handleDomainEvent(event: DomainEventPayload): void {
	switch (event.kind) {
		case "spaces-changed":
			// `spaces-changed` means "the set of spaces visible to this peer
			// has changed" — that covers both the global list AND this peer's
			// memberships (e.g. a remote join-decision granted access). Both
			// caches invalidate together so settings/access UI stays fresh.
			store.dispatch(
				api.util.invalidateTags([
					{ type: "Spaces", id: "LIST" },
					{ type: "Memberships", id: "LIST" },
				]),
			);
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
	return backend.events.onDomain((event) => {
		const parsed = parseDomainEventPayload(event);
		if (!parsed) return;
		handleDomainEvent(parsed);
	});
}
