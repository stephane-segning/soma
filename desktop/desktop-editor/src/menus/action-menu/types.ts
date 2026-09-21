import type { Editor } from "@tiptap/react";
import type { BlockKind } from "../block-rotation";

export type ActiveNode = {
	pos: number;
	insertPos: number;
	blockKind: BlockKind;
};

export type CreateAddMenuItemsInput = {
	activeNode: ActiveNode | null;
	editor: Editor | null;
	insertAt: (content: Record<string, unknown>) => void;
	onInsertImage?: (editor: Editor, insertPos: number) => Promise<void>;
	onInsertFile?: (editor: Editor, insertPos: number) => Promise<void>;
	/**
	 * Called instead of a synchronous `insertAt` for the "Page link" item.
	 * Unlike image/file upload there's no host-native picker to delegate
	 * to — the host app owns the "search this space's pages, or create a
	 * new one" UI entirely and inserts the resolved `pageLink` node
	 * itself once the user picks, so this hook only needs to hand back
	 * `(editor, insertPos)` and doesn't return the inserted content.
	 */
	onInsertPageLink?: (editor: Editor, insertPos: number) => Promise<void>;
};
