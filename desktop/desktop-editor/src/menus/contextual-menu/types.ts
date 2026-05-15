export type QuickActionType = "explain" | "expand" | "research";

export type QuickActionRequest = {
	action: QuickActionType;
	selectionText: string;
};

export type QuickActionResponse = {
	status: "done" | "queued";
	content?: string;
	message?: string;
};
