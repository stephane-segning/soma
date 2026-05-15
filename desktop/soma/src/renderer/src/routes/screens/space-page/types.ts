import type { EditorCommand, JSONContent } from "@soma/editor";

export type LoaderData = {
	spaceId: string;
	pageId: string;
	pageTitle: string;
	initialContentJson: string | null;
};

export type PageRecord = {
	spaceId: string;
	pageId: string;
	title: string;
	parentPageIds: string[];
	createdAtMs: number;
	updatedAtMs: number;
};

export type EditorLike = Parameters<EditorCommand["handler"]>[0]["editor"];

export type PendingPageInsert = {
	editor: EditorLike;
	range: {
		from: number;
		to: number;
	};
};

export type PageBlobContext = {
	spaceId: string;
	pageId: string;
};

export type ParsedContent = JSONContent | undefined;
