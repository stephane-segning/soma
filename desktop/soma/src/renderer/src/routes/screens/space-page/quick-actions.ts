import { useCallback } from "react";
import * as chatService from "../../../services/chat-service";

type QuickActionInput = {
	action: "explain" | "expand" | "research";
	selectionText: string;
};

type QuickActionResult =
	| {
			status: "done";
			content: string;
	  }
	| {
			status: "queued";
			message: string;
	  };

export function usePageQuickActions({
	spaceId,
	pageId,
}: {
	spaceId: string;
	pageId: string;
}): (input: QuickActionInput) => Promise<QuickActionResult> {
	return useCallback(
		async ({ action, selectionText }: QuickActionInput): Promise<QuickActionResult> => {
			if (action === "explain") {
				const content = await chatService.runExplainSelection(selectionText, { spaceId });
				return { status: "done", content };
			}

			if (action === "expand") {
				const content = await chatService.runExpandSelection(selectionText, { spaceId });
				return { status: "done", content };
			}

			await chatService.enqueueBackgroundTask({
				kind: "research-selection",
				spaceId,
				documentId: pageId,
				selectionText,
				persistInDocument: false,
			});

			return {
				status: "queued",
				message: "Research task queued in agentd.",
			};
		},
		[pageId, spaceId],
	);
}
