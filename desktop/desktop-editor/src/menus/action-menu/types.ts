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
};
