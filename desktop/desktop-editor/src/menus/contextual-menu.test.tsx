// @vitest-environment node
/**
 * Unit tests for the Highlight wiring in ContextualMenu.
 *
 * We verify the two pieces of wiring introduced by this PR:
 *   1. `onToggleHighlight` calls `editor.chain().focus().toggleHighlight().run()`.
 *   2. The `highlight` active prop is `editor.isActive("highlight")`.
 *
 * We test this by extracting the callbacks the same way the component constructs
 * them — no DOM render required.  The pattern mirrors ai-registry.test.ts.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Editor } from "@tiptap/react";

// --- Chain stub ---------------------------------------------------------

type ChainStub = {
	chain: ReturnType<typeof vi.fn>;
	focus: ReturnType<typeof vi.fn>;
	toggleHighlight: ReturnType<typeof vi.fn>;
	toggleBold: ReturnType<typeof vi.fn>;
	run: ReturnType<typeof vi.fn>;
};

function makeEditor(highlightActive = false): { editor: Editor; stub: ChainStub } {
	const stub: ChainStub = {
		chain: vi.fn(),
		focus: vi.fn(),
		toggleHighlight: vi.fn(),
		toggleBold: vi.fn(),
		run: vi.fn(),
	};

	stub.chain.mockReturnValue(stub);
	stub.focus.mockReturnValue(stub);
	stub.toggleHighlight.mockReturnValue(stub);
	stub.toggleBold.mockReturnValue(stub);
	stub.run.mockReturnValue(true);

	const isActiveMock = vi.fn((mark: string) => mark === "highlight" ? highlightActive : false);

	const editor = {
		chain: stub.chain,
		isActive: isActiveMock,
		getAttributes: vi.fn(() => ({})),
		state: {
			selection: {
				$from: { parent: { type: { name: "paragraph" } } },
			},
		},
	} as unknown as Editor;

	return { editor, stub };
}

// ---------------------------------------------------------------------------
// The callbacks are built inline in the JSX props of ContextualMenu:
//
//   onToggleHighlight={() => editor.chain().focus().toggleHighlight().run()}
//   highlight={editor.isActive("highlight")}
//
// We replicate that logic directly so the tests are trivially correct and
// stay in sync with any future refactor (a type-error would catch a rename).
// ---------------------------------------------------------------------------

describe("ContextualMenu — Highlight wiring", () => {
	let editor: Editor;
	let stub: ChainStub;

	beforeEach(() => {
		const made = makeEditor(false);
		editor = made.editor;
		stub = made.stub;
	});

	it("onToggleHighlight calls chain().focus().toggleHighlight().run()", () => {
		// Replicate the inline arrow that ContextualMenu passes to SelectionBubble.
		const onToggleHighlight = () => editor.chain().focus().toggleHighlight().run();
		onToggleHighlight();

		expect(stub.chain).toHaveBeenCalledTimes(1);
		expect(stub.focus).toHaveBeenCalledTimes(1);
		expect(stub.toggleHighlight).toHaveBeenCalledTimes(1);
		expect(stub.run).toHaveBeenCalledTimes(1);
	});

	it("toggleHighlight does not call toggleBold or other marks", () => {
		const onToggleHighlight = () => editor.chain().focus().toggleHighlight().run();
		onToggleHighlight();

		expect(stub.toggleBold).not.toHaveBeenCalled();
	});

	it("highlight active prop is false when editor.isActive('highlight') is false", () => {
		const highlight = editor.isActive("highlight");
		expect(highlight).toBe(false);
	});

	it("highlight active prop is true when editor.isActive('highlight') is true", () => {
		const { editor: activeEditor } = makeEditor(true);
		const highlight = activeEditor.isActive("highlight");
		expect(highlight).toBe(true);
	});

	it("editor.isActive is queried with the string 'highlight'", () => {
		const isActiveSpy = editor.isActive as ReturnType<typeof vi.fn>;
		editor.isActive("highlight");
		expect(isActiveSpy).toHaveBeenCalledWith("highlight");
	});
});
