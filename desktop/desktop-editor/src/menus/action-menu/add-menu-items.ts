import type { ContextMenuItem } from "@soma/ui/components/overlays/context-menu";
import { bulletListBlock, headingBlock, orderedListBlock, paragraphBlock, taskListBlock } from "./blocks";
import type { CreateAddMenuItemsInput } from "./types";

export function createAddMenuItems({
	activeNode,
	editor,
	insertAt,
	onInsertFile,
	onInsertImage,
	onInsertPageLink,
}: CreateAddMenuItemsInput): ContextMenuItem[] {
	return [
		{ id: "add-paragraph", label: "Paragraph", onSelect: () => insertAt(paragraphBlock) },
		{ id: "add-heading-2", label: "Heading", onSelect: () => insertAt(headingBlock) },
		{ id: "add-bullet-list", label: "Bulleted list", onSelect: () => insertAt(bulletListBlock) },
		{ id: "add-numbered-list", label: "Numbered list", onSelect: () => insertAt(orderedListBlock) },
		{ id: "add-task-list", label: "Task list", onSelect: () => insertAt(taskListBlock) },
		{
			id: "add-image-upload",
			label: "Image",
			onSelect: async () => {
				if (editor && activeNode && onInsertImage) await onInsertImage(editor, activeNode.insertPos);
			},
		},
		{
			id: "add-file-upload",
			label: "File",
			onSelect: async () => {
				if (editor && activeNode && onInsertFile) await onInsertFile(editor, activeNode.insertPos);
			},
		},
		{ id: "add-divider", label: "Divider", onSelect: () => insertAt({ type: "horizontalRule" }) },
		{ id: "add-code", label: "Code block", onSelect: () => insertAt({ type: "codeBlock" }) },
		{
			id: "add-page-link",
			label: "Page link",
			onSelect: async () => {
				if (editor && activeNode && onInsertPageLink) await onInsertPageLink(editor, activeNode.insertPos);
			},
		},
	];
}
