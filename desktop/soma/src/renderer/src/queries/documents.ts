import { useMutation, useQuery } from "@tanstack/react-query";
import * as documentsService from "../services/documents-service";

type DraftRow = {
	spaceId: string;
	documentId: string;
	contentJson: string;
	published: 0 | 1;
	updatedAtMs: number;
};

function useDocumentDraftQuery(spaceId: string, documentId: string) {
	return useQuery({
		queryKey: ["documents", "draft", spaceId, documentId] as const,
		queryFn: async (): Promise<DraftRow | null> =>
			documentsService.getDraft({ spaceId, documentId }),
	});
}

function useUpsertDocumentDraftMutation() {
	return useMutation({
		mutationFn: async (input: {
			spaceId: string;
			documentId: string;
			contentJson: string;
			published: boolean;
		}) => documentsService.upsertDraft(input),
	});
}

function useQueueDaemonSyncMutation() {
	return useMutation({
		mutationFn: async (input: {
			spaceId: string;
			documentId: string;
			contentJson: string;
			updatedAtMs: number;
			published?: boolean;
		}) => documentsService.queueDaemonSync(input),
	});
}

function useSyncPublishedDocumentMutation() {
	return useMutation({
		mutationFn: async (input: {
			spaceId: string;
			documentId: string;
			contentJson: string;
			updatedAtMs: number;
		}) => documentsService.syncPublishedDocument(input),
	});
}

export {
	useDocumentDraftQuery,
	useQueueDaemonSyncMutation,
	useSyncPublishedDocumentMutation,
	useUpsertDocumentDraftMutation,
};
export type { DraftRow };
