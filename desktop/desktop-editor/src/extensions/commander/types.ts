import type { Range } from "@tiptap/core";
import type { Editor } from "@tiptap/core";
import type { SlashMenuSection } from "@soma/ui/components/editor/slash-menu";
import type { ReactNode } from "react";

export type EditorCommand = {
	key: string;
	name: string;
	description?: string;
	keywords?: string[];
	disabled?: boolean;
	/**
	 * Section in the locked v0 SlashMenu layout. Drives section grouping
	 * (Text · List · Embed · Action · Advanced) per refs editor §1.
	 */
	section: SlashMenuSection;
	/** Monochrome icon shown on the row. Recommended size: 14–16px. */
	icon?: ReactNode;
	/** Right-aligned shortcut hint (display only). */
	shortcut?: string;
	handler(args: { editor: Editor; range: Range }): void | Promise<void>;
};
