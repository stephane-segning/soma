/**
 * Regression test for ActionMenu's DragHandle prop identity stability.
 *
 * `@tiptap/extension-drag-handle-react` puts `onNodeChange`,
 * `onElementDragStart`, `onElementDragEnd`, and `computePositionConfig`
 * into a useEffect dep list. If any of those props gets a fresh
 * identity on every render, the ProseMirror drag-handle plugin
 * unregisters and re-registers — which reconfigures the editor's
 * plugin list and resets the suggestion plugin (the slash menu) to
 * `{ active: false }`. From the user's POV, the slash menu vanishes
 * the instant the mouse moves.
 *
 * The fix: wrap the three callbacks in `useCallback` and memoize the
 * computePositionConfig. This test pins that contract by capturing the
 * props the DragHandle would receive across re-renders.
 */
import { render } from "@testing-library/react";
import type { Editor } from "@tiptap/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

// Capture every prop set the (mocked) DragHandle receives so we can
// assert identity stability across renders.
const dragHandleCalls: Array<Record<string, unknown>> = [];

vi.mock("@tiptap/extension-drag-handle-react", () => ({
	DragHandle: ({
		children,
		onNodeChange,
		onElementDragStart,
		onElementDragEnd,
		computePositionConfig,
	}: {
		children: ReactNode;
		onNodeChange?: unknown;
		onElementDragStart?: unknown;
		onElementDragEnd?: unknown;
		computePositionConfig?: unknown;
	}) => {
		dragHandleCalls.push({
			onNodeChange,
			onElementDragStart,
			onElementDragEnd,
			computePositionConfig,
		});
		return <div data-testid="mock-drag-handle">{children}</div>;
	},
}));

vi.mock("@soma/ui/i18n", () => ({
	useT: () => (input: { defaultMessage?: string } | string) =>
		typeof input === "string" ? input : (input.defaultMessage ?? ""),
}));

vi.mock("@soma/ui/utils/cn", () => ({
	cn: (...args: unknown[]) =>
		args
			.flat(Infinity)
			.filter((v) => typeof v === "string" && v.length > 0)
			.join(" "),
}));

vi.mock("@soma/ui/components/overlays/context-menu", () => ({
	ContextMenu: () => null,
}));

import { ActionMenu } from "./action-menu";

function makeEditor(): Editor {
	return {
		isActive: vi.fn(() => false),
		chain: vi.fn(() => ({ focus: vi.fn().mockReturnThis(), run: vi.fn() })),
		state: { doc: { nodeAt: vi.fn() }, selection: { $from: { parent: { type: { name: "paragraph" } } } } },
		view: { state: {} },
	} as unknown as Editor;
}

describe("ActionMenu — DragHandle prop identity", () => {
	it("passes the same callback identities to DragHandle across re-renders", () => {
		dragHandleCalls.length = 0;
		const editor = makeEditor();
		const { rerender } = render(<ActionMenu editor={editor} />);

		// Force a re-render with the same props. Without useCallback, every
		// re-render would mint fresh function identities and the drag-handle
		// plugin would unregister + re-register on every mouse move.
		rerender(<ActionMenu editor={editor} />);
		rerender(<ActionMenu editor={editor} />);

		expect(dragHandleCalls.length).toBeGreaterThanOrEqual(3);
		const first = dragHandleCalls[0];
		for (const subsequent of dragHandleCalls.slice(1)) {
			expect(subsequent.onNodeChange).toBe(first.onNodeChange);
			expect(subsequent.onElementDragStart).toBe(first.onElementDragStart);
			expect(subsequent.onElementDragEnd).toBe(first.onElementDragEnd);
			expect(subsequent.computePositionConfig).toBe(first.computePositionConfig);
		}
	});
});
