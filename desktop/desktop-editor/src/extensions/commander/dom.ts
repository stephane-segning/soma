import type { Editor } from "@tiptap/core";

export function getEditorDom(editor: Editor): Element | null {
	const element = editor.options.element;
	return element instanceof Element ? element : null;
}
