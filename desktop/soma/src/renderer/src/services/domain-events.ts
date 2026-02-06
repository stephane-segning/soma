import { api } from "@app/store/api";
import { store } from "@app/store/store";

type DomainEvent =
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

type DomainEventHandler = (event: DomainEvent) => void;

function handleDomainEvent(event: DomainEvent): void {
	switch (event.kind) {
		case "spaces-changed":
			store.dispatch(
				api.util.invalidateTags([
					{ type: "Spaces", id: "LIST" },
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
			store.dispatch(
				api.util.invalidateTags([
					{ type: "Pages", id: event.spaceId },
				]),
			);
			return;
		case "document-changed":
			store.dispatch(
				api.util.invalidateTags([
					{ type: "Draft", id: `${event.spaceId}:${event.documentId}` },
				]),
			);
			return;
	}
}

export function startDomainEventListener(): () => void {
	const apiBridge = typeof window !== "undefined" ? (window as any).api : undefined;
	if (!apiBridge?.onDomainEvent) {
		return () => undefined;
	}

	const handler: DomainEventHandler = (event) => {
		if (!event || typeof event.kind !== "string") return;
		handleDomainEvent(event);
	};

	return apiBridge.onDomainEvent(handler);
}
