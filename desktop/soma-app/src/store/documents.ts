import { create } from "zustand";

type DocumentKey = `${string}:${string}`;

type DocumentEditorState = {
	spaceId: string;
	documentId: string;
	contentJson: string | null;
	published: boolean;
	lastEditedAtMs: number;
};

type DocumentsStore = {
	byKey: Record<DocumentKey, DocumentEditorState | undefined>;
	getKey: (spaceId: string, documentId: string) => DocumentKey;
	ensure: (spaceId: string, documentId: string) => void;
	setContentJson: (
		spaceId: string,
		documentId: string,
		contentJson: string,
	) => void;
	setPublished: (
		spaceId: string,
		documentId: string,
		published: boolean,
	) => void;
	hydrateFromDraft: (draft: {
		spaceId: string;
		documentId: string;
		contentJson: string;
		published: 0 | 1;
		updatedAtMs: number;
	}) => void;
};

function makeKey(spaceId: string, documentId: string): DocumentKey {
	return `${spaceId}:${documentId}`;
}

const useDocumentsStore = create<DocumentsStore>((set, get) => ({
	byKey: {},
	getKey: makeKey,
	ensure: (spaceId, documentId) => {
		const key = makeKey(spaceId, documentId);
		const existing = get().byKey[key];
		if (existing) return;
		set((state) => ({
			byKey: {
				...state.byKey,
				[key]: {
					spaceId,
					documentId,
					contentJson: null,
					published: false,
					lastEditedAtMs: 0,
				},
			},
		}));
	},
	setContentJson: (spaceId, documentId, contentJson) => {
		const key = makeKey(spaceId, documentId);
		set((state) => ({
			byKey: {
				...state.byKey,
				[key]: {
					...(state.byKey[key] ?? {
						spaceId,
						documentId,
						contentJson: null,
						published: false,
						lastEditedAtMs: 0,
					}),
					contentJson,
					lastEditedAtMs: Date.now(),
				},
			},
		}));
	},
	setPublished: (spaceId, documentId, published) => {
		const key = makeKey(spaceId, documentId);
		set((state) => ({
			byKey: {
				...state.byKey,
				[key]: {
					...(state.byKey[key] ?? {
						spaceId,
						documentId,
						contentJson: null,
						published: false,
						lastEditedAtMs: 0,
					}),
					published,
				},
			},
		}));
	},
	hydrateFromDraft: (draft) => {
		const key = makeKey(draft.spaceId, draft.documentId);
		set((state) => {
			const existing = state.byKey[key];
			if (
				existing?.lastEditedAtMs &&
				existing.lastEditedAtMs >= draft.updatedAtMs
			) {
				return state;
			}
			return {
				byKey: {
					...state.byKey,
					[key]: {
						spaceId: draft.spaceId,
						documentId: draft.documentId,
						contentJson: draft.contentJson,
						published: draft.published === 1,
						lastEditedAtMs: draft.updatedAtMs,
					},
				},
			};
		});
	},
}));

export { useDocumentsStore };
