import type { MentionSectionKind } from "@soma/ui/components/editor/mention-picker";

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
	/**
	 * Which section the resolved items belong to in the locked v0
	 * MentionPicker layout (refs editor §1 / refs main §3). Each
	 * extension instance shows a single section since one provider
	 * is registered per trigger char.
	 */
	section: MentionSectionKind;
};
