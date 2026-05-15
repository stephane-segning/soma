import type { Editor } from "@tiptap/core";

export const navigationKeys = ["ArrowUp", "ArrowDown", "Enter"];

export function getEditorDom(editor: Editor): Element | null {
	const element = editor.options.element;
	return element instanceof Element ? element : null;
}
