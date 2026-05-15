export type MentionItem = {
	id: string;
	label: string;
	detail?: string;
	href: string;
	insertText?: string;
};

export type MentionProvider = {
	name: string;
	char: string;
	items: (query: string) => Promise<MentionItem[]>;
	placeholder?: string;
};
