import type { ContextMenuItem } from "@soma/ui/components/overlays/context-menu";
import {
	accordionBlock,
	bulletListBlock,
	carouselBlock,
	headingBlock,
	orderedListBlock,
	pageLinkBlock,
	paragraphBlock,
	taskListBlock,
	textRotateBlock,
} from "./blocks";
import type { CreateAddMenuItemsInput } from "./types";

export function createAddMenuItems({
	activeNode,
	editor,
	insertAt,
	onInsertFile,
	onInsertImage,
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
		{ id: "add-page-link", label: "Page link", onSelect: () => insertAt(pageLinkBlock) },
		{ id: "add-text-rotate", label: "Text rotate (decorative)", onSelect: () => insertAt(textRotateBlock) },
		{ id: "add-carousel", label: "Carousel (decorative)", onSelect: () => insertAt(carouselBlock) },
		{ id: "add-accordion", label: "Accordion (decorative)", onSelect: () => insertAt(accordionBlock) },
	];
}
