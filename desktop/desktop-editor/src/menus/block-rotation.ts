import type { Editor } from "@tiptap/react";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

export type BlockKind =
	| "paragraph"
	| "heading-2"
	| "heading-3"
	| "bullet-list"
	| "ordered-list"
	| "task-list"
	| "blockquote"
	| "code-block";

const ROTATION_ORDER: BlockKind[] = [
	"paragraph",
	"heading-2",
	"heading-3",
	"bullet-list",
	"ordered-list",
	"task-list",
	"blockquote",
	"code-block",
];

export const BLOCK_LABEL: Record<BlockKind, string> = {
	paragraph: "Paragraph",
	"heading-2": "Heading 2",
	"heading-3": "Heading 3",
	"bullet-list": "Bullet List",
	"ordered-list": "Numbered List",
	"task-list": "Task List",
	blockquote: "Quote",
	"code-block": "Code Block",
};

export const BLOCK_KIND_ORDER: readonly BlockKind[] = ROTATION_ORDER;

function nextBlockKind(kind: BlockKind): BlockKind {
	const index = ROTATION_ORDER.indexOf(kind);
	if (index < 0) return "paragraph";
	return ROTATION_ORDER[(index + 1) % ROTATION_ORDER.length] ?? "paragraph";
}

export function readCurrentBlockKind(editor: Editor): BlockKind {
	if (editor.isActive("codeBlock")) return "code-block";
	if (editor.isActive("blockquote")) return "blockquote";
	if (editor.isActive("taskList")) return "task-list";
	if (editor.isActive("orderedList")) return "ordered-list";
	if (editor.isActive("bulletList")) return "bullet-list";
	if (editor.isActive("heading", { level: 3 })) return "heading-3";
	if (editor.isActive("heading", { level: 2 })) return "heading-2";
	return "paragraph";
}

export function readBlockKindFromNode(node: ProseMirrorNode | null): BlockKind {
	if (!node) return "paragraph";
	switch (node.type.name) {
		case "heading":
			return node.attrs.level === 3 ? "heading-3" : "heading-2";
		case "bulletList":
			return "bullet-list";
		case "orderedList":
			return "ordered-list";
		case "taskList":
			return "task-list";
		case "blockquote":
			return "blockquote";
		case "codeBlock":
			return "code-block";
		case "paragraph":
		default:
			return "paragraph";
	}
}

export function getRotateActionLabel(kind: BlockKind): string {
	return `Rotate to ${BLOCK_LABEL[nextBlockKind(kind)]}`;
}

export function rotateBlock(editor: Editor): { from: BlockKind; to: BlockKind } {
	const from = readCurrentBlockKind(editor);
	const to = nextBlockKind(from);
	applyBlockKind(editor, to);
	return { from, to };
}

export function applyBlockKind(editor: Editor, kind: BlockKind): void {
	switch (kind) {
		case "paragraph":
			editor.chain().focus().setParagraph().run();
			return;
		case "heading-2":
			editor.chain().focus().setHeading({ level: 2 }).run();
			return;
		case "heading-3":
			editor.chain().focus().setHeading({ level: 3 }).run();
			return;
		case "bullet-list":
			editor.chain().focus().toggleBulletList().run();
			return;
		case "ordered-list":
			editor.chain().focus().toggleOrderedList().run();
			return;
		case "task-list":
			editor.chain().focus().toggleTaskList().run();
			return;
		case "blockquote":
			editor.chain().focus().toggleBlockquote().run();
			return;
		case "code-block":
			editor.chain().focus().toggleCodeBlock().run();
			return;
	}
}
