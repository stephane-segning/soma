import type { Editor } from "@tiptap/react";

export type SelectionSnapshot = {
	text: string;
	range: {
		from: number;
		to: number;
	};
	anchor: {
		x: number;
		y: number;
	};
};

export function readSelection(editor: Editor): SelectionSnapshot | null {
	const { from, to, empty } = editor.state.selection;
	if (empty || from === to) return null;
	const text = editor.state.doc.textBetween(from, to, "\n", "\n").trim();
	if (!text) return null;

	const fromCoords = editor.view.coordsAtPos(from);
	const toCoords = editor.view.coordsAtPos(to);
	return {
		text,
		range: { from, to },
		anchor: {
			x: (fromCoords.left + toCoords.right) / 2,
			y: Math.max(fromCoords.bottom, toCoords.bottom) + 10,
		},
	};
}
