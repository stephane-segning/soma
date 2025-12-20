import { useMutation, useQuery } from "@tanstack/react-query";

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
			window.api.documents.getDraft({ spaceId, documentId }),
	});
}

function useUpsertDocumentDraftMutation() {
	return useMutation({
		mutationFn: async (input: {
			spaceId: string;
			documentId: string;
			contentJson: string;
			published: boolean;
		}) => window.api.documents.upsertDraft(input),
	});
}

function useQueueDaemonSyncMutation() {
	return useMutation({
		mutationFn: async (input: {
			spaceId: string;
			documentId: string;
			contentJson: string;
			updatedAtMs: number;
		}) => window.api.documents.queueDaemonSync(input),
	});
}

function useSyncPublishedDocumentMutation() {
	return useMutation({
		mutationFn: async (input: {
			spaceId: string;
			documentId: string;
			contentJson: string;
			updatedAtMs: number;
		}) => window.api.daemon.syncPublishedDocument(input),
	});
}

export {
	useDocumentDraftQuery,
	useQueueDaemonSyncMutation,
	useSyncPublishedDocumentMutation,
	useUpsertDocumentDraftMutation,
};
export type { DraftRow };
