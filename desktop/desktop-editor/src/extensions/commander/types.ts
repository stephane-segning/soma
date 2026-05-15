import type { Range } from "@tiptap/core";
import type { Editor } from "@tiptap/core";

export type EditorCommand = {
	key: string;
	name: string;
	description?: string;
	keywords?: string[];
	disabled?: boolean;
	handler(args: { editor: Editor; range: Range }): void | Promise<void>;
};
