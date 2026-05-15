import type { Editor } from "@tiptap/core";
import type { Transaction } from "@tiptap/pm/state";

export function dispatchIfMounted(editor: Editor, tr: Transaction): void {
	const element = editor.options.element;
	if (!(element instanceof HTMLElement)) return;
	if (editor.isDestroyed) return;
	try {
		editor.view.dispatch(tr);
	} catch {
		// Ignore uploads completing after unmount.
	}
}
