import {
	createSlice,
	type PayloadAction,
} from "@reduxjs/toolkit";

type DocumentKey =
	`${string}:${string}`;

type DocumentEditorState =
	{
		spaceId: string;
		documentId: string;
		contentJson:
			| string
			| null;
		published: boolean;
		lastEditedAtMs: number;
	};

type DocumentsState =
	{
		byKey: Record<
			DocumentKey,
			| DocumentEditorState
			| undefined
		>;
	};

function makeKey(
	spaceId: string,
	documentId: string,
): DocumentKey {
	return `${spaceId}:${documentId}`;
}

type DraftDocument =
	{
		spaceId: string;
		documentId: string;
		contentJson: string;
		published:
			| 0
			| 1;
		updatedAtMs: number;
	};

function createDefaultDocumentState(
	spaceId: string,
	documentId: string,
): DocumentEditorState {
	return {
		spaceId,
		documentId,
		contentJson:
			null,
		published: false,
		lastEditedAtMs: 0,
	};
}

const initialState: DocumentsState =
	{
		byKey:
			{},
	};

const documentsSlice =
	createSlice(
		{
			name: "documents",
			initialState,
			reducers:
				{
					ensure(
						state,
						action: PayloadAction<{
							spaceId: string;
							documentId: string;
						}>,
					) {
						const key =
							makeKey(
								action
									.payload
									.spaceId,
								action
									.payload
									.documentId,
							);
						if (
							state
								.byKey[
								key
							]
						)
							return;
						state.byKey[
							key
						] =
							createDefaultDocumentState(
								action
									.payload
									.spaceId,
								action
									.payload
									.documentId,
							);
					},
					setContentJson:
						{
							prepare(
								spaceId: string,
								documentId: string,
								contentJson: string,
							) {
								return {
									payload:
										{
											spaceId,
											documentId,
											contentJson,
											editedAtMs:
												Date.now(),
										},
								};
							},
							reducer(
								state,
								action: PayloadAction<{
									spaceId: string;
									documentId: string;
									contentJson: string;
									editedAtMs: number;
								}>,
							) {
								const key =
									makeKey(
										action
											.payload
											.spaceId,
										action
											.payload
											.documentId,
									);
								const existing =
									state
										.byKey[
										key
									] ??
									createDefaultDocumentState(
										action
											.payload
											.spaceId,
										action
											.payload
											.documentId,
									);
								state.byKey[
									key
								] =
									{
										...existing,
										contentJson:
											action
												.payload
												.contentJson,
										lastEditedAtMs:
											action
												.payload
												.editedAtMs,
									};
							},
						},
					setPublished(
						state,
						action: PayloadAction<{
							spaceId: string;
							documentId: string;
							published: boolean;
						}>,
					) {
						const key =
							makeKey(
								action
									.payload
									.spaceId,
								action
									.payload
									.documentId,
							);
						const existing =
							state
								.byKey[
								key
							] ??
							createDefaultDocumentState(
								action
									.payload
									.spaceId,
								action
									.payload
									.documentId,
							);
						state.byKey[
							key
						] =
							{
								...existing,
								published:
									action
										.payload
										.published,
							};
					},
					hydrateFromDraft(
						state,
						action: PayloadAction<DraftDocument>,
					) {
						const draft =
							action.payload;
						const key =
							makeKey(
								draft.spaceId,
								draft.documentId,
							);
						const existing =
							state
								.byKey[
								key
							];
						if (
							existing?.lastEditedAtMs &&
							existing.lastEditedAtMs >=
								draft.updatedAtMs
						) {
							return;
						}
						state.byKey[
							key
						] =
							{
								spaceId:
									draft.spaceId,
								documentId:
									draft.documentId,
								contentJson:
									draft.contentJson,
								published:
									draft.published ===
									1,
								lastEditedAtMs:
									draft.updatedAtMs,
							};
					},
				},
		},
	);

const documentsReducer =
	documentsSlice.reducer;
const documentsActions =
	documentsSlice.actions;
const documentsSelectors =
	{
		selectByKey:
			(state: {
				documents: DocumentsState;
			}) =>
				state
					.documents
					.byKey,
	};

export {
	documentsActions,
	documentsReducer,
	documentsSelectors,
	makeKey,
};
export type {
	DocumentEditorState,
	DocumentKey,
	DocumentsState,
	DraftDocument,
};
