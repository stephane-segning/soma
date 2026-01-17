import { api, type DraftRow } from "@soma/store/api";

const useDocumentDraftQuery = (spaceId: string, documentId: string) =>
	api.useGetDraftQuery({ spaceId, documentId });

function useUpsertDocumentDraftMutation() {
	const [mutate, state] = api.useUpsertDraftMutation();
	return {
		...state,
		mutate,
		mutateAsync: (input: {
			spaceId: string;
			documentId: string;
			contentJson: string;
			published: boolean;
		}) => mutate(input).unwrap(),
	};
}

function useQueueDaemonSyncMutation() {
	const [mutate, state] = api.useQueueDaemonSyncMutation();
	return {
		...state,
		mutate,
		mutateAsync: (input: {
			spaceId: string;
			documentId: string;
			contentJson: string;
			updatedAtMs: number;
			published?: boolean;
		}) => mutate(input).unwrap(),
	};
}

function useSyncPublishedDocumentMutation() {
	const [mutate, state] = api.useSyncPublishedDocumentMutation();
	return {
		...state,
		mutate,
		mutateAsync: (input: {
			spaceId: string;
			documentId: string;
			contentJson: string;
			updatedAtMs: number;
		}) => mutate(input).unwrap(),
	};
}

export {
	useDocumentDraftQuery,
	useQueueDaemonSyncMutation,
	useSyncPublishedDocumentMutation,
	useUpsertDocumentDraftMutation,
};
export type { DraftRow };
