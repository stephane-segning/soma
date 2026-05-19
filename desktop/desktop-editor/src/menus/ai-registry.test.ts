// @vitest-environment node
import type { Editor } from "@tiptap/react";
import { beforeEach, describe, expect, it, type Mock, vi } from "vitest";

import { createDefaultAIRegistry } from "./ai-registry";
import type {
	QuickActionRequest,
	QuickActionResponse,
} from "./contextual-menu/types";

type QuickActionMock = Mock<
	(input: QuickActionRequest) => Promise<QuickActionResponse>
>;

// The factory only touches `editor.chain().focus().insertContentAt(...).run()`,
// so a hand-rolled mock that records the call chain is enough — no jsdom or
// TipTap runtime required.
type ChainStub = {
	chain: ReturnType<typeof vi.fn>;
	focus: ReturnType<typeof vi.fn>;
	insertContentAt: ReturnType<typeof vi.fn>;
	run: ReturnType<typeof vi.fn>;
};

function makeEditor(): { editor: Editor; stub: ChainStub } {
	const stub: ChainStub = {
		chain: vi.fn(),
		focus: vi.fn(),
		insertContentAt: vi.fn(),
		run: vi.fn(),
	};
	stub.chain.mockReturnValue(stub);
	stub.focus.mockReturnValue(stub);
	stub.insertContentAt.mockReturnValue(stub);
	stub.run.mockReturnValue(stub);

	return {
		editor: { chain: stub.chain } as unknown as Editor,
		stub,
	};
}

// Kebab-case is intentional: the NodeAIRegistryExtension calls
// `normalizeNodeName` on TipTap's camelCase node names (`bulletList`,
// `codeBlock`, …) before resolving, so the registry contract — and the
// stories in `@soma/ui` — both live in kebab-case. See
// `src/extensions/node-ai-registry.ts:230`.
const TEXT_BEARING = [
	"paragraph",
	"heading",
	"blockquote",
	"bullet-list",
	"ordered-list",
	"task-list",
	"code-block",
];

describe("createDefaultAIRegistry", () => {
	let editor: Editor;
	let stub: ChainStub;
	let onQuickAction: QuickActionMock;

	beforeEach(() => {
		const made = makeEditor();
		editor = made.editor;
		stub = made.stub;
		onQuickAction = vi.fn<
			(input: QuickActionRequest) => Promise<QuickActionResponse>
		>();
	});

	it("returns an empty registry when no onQuickAction handler is supplied", () => {
		const registry = createDefaultAIRegistry({ editor });
		for (const nodeType of TEXT_BEARING) {
			expect(registry.resolve(nodeType, "selection")).toEqual([]);
		}
	});

	it("registers explain/expand/research for every text-bearing block type", () => {
		const registry = createDefaultAIRegistry({ editor, onQuickAction });

		for (const nodeType of TEXT_BEARING) {
			const actions = registry
				.resolve(nodeType, "selection")
				.map((a) => a.id);
			expect(actions).toEqual(["explain", "expand", "research"]);
		}
	});

	it("does not register actions on the `caret` surface", () => {
		const registry = createDefaultAIRegistry({ editor, onQuickAction });
		expect(registry.resolve("paragraph", "caret")).toEqual([]);
	});

	it("does not register actions on node types outside the text-bearing list", () => {
		const registry = createDefaultAIRegistry({ editor, onQuickAction });
		expect(registry.resolve("image", "selection")).toEqual([]);
		expect(registry.resolve("horizontal-rule", "selection")).toEqual([]);
	});

	// --- node surface (drag-handle AI button, cutover 5e) ---

	it("registers explain/expand/research on the `node` surface for every text-bearing type", () => {
		const registry = createDefaultAIRegistry({ editor, onQuickAction });

		for (const nodeType of TEXT_BEARING) {
			const actions = registry.resolve(nodeType, "node").map((a) => a.id);
			expect(actions).toEqual(["explain", "expand", "research"]);
		}
	});

	it("returns no node-surface actions when no onQuickAction handler is supplied", () => {
		const registry = createDefaultAIRegistry({ editor });
		for (const nodeType of TEXT_BEARING) {
			expect(registry.resolve(nodeType, "node")).toEqual([]);
		}
	});

	it("does not register node-surface actions for non-text-bearing node types (image, horizontal-rule)", () => {
		const registry = createDefaultAIRegistry({ editor, onQuickAction });
		expect(registry.resolve("image", "node")).toEqual([]);
		expect(registry.resolve("horizontal-rule", "node")).toEqual([]);
	});

	it("orders actions by their locked category (rewrite → transform → custom)", () => {
		const registry = createDefaultAIRegistry({ editor, onQuickAction });
		const cats = registry
			.resolve("paragraph", "selection")
			.map((a) => a.category);
		expect(cats).toEqual(["rewrite", "transform", "custom"]);
	});

	describe("explain action", () => {
		it("calls onQuickAction with action=explain + the selection text", async () => {
			onQuickAction.mockResolvedValue({
				status: "done",
				content: "plain-language version",
			} satisfies QuickActionResponse);

			const registry = createDefaultAIRegistry({ editor, onQuickAction });
			const explain = registry
				.resolve("paragraph", "selection")
				.find((a) => a.id === "explain");
			expect(explain).toBeDefined();

			await explain?.run({
				nodeType: "paragraph", surface: "selection",
				text: "raw text",
				metadata: { from: 4, to: 12 },
			});

			expect(onQuickAction).toHaveBeenCalledWith({
				action: "explain",
				selectionText: "raw text",
			} satisfies QuickActionRequest);
		});

		it("inserts the response content at the selection range", async () => {
			onQuickAction.mockResolvedValue({
				status: "done",
				content: "  trimmed body  ",
			});

			const registry = createDefaultAIRegistry({ editor, onQuickAction });
			const explain = registry
				.resolve("paragraph", "selection")
				.find((a) => a.id === "explain");

			await explain?.run({
				nodeType: "paragraph", surface: "selection",
				text: "raw",
				metadata: { from: 4, to: 12 },
			});

			expect(stub.chain).toHaveBeenCalledTimes(1);
			expect(stub.focus).toHaveBeenCalledTimes(1);
			expect(stub.insertContentAt).toHaveBeenCalledWith(
				{ from: 4, to: 12 },
				"trimmed body",
			);
			expect(stub.run).toHaveBeenCalledTimes(1);
		});

		it("skips the editor mutation when the response status is not 'done'", async () => {
			onQuickAction.mockResolvedValue({
				status: "queued",
				message: "queued for later",
				content: "ignored",
			});

			const registry = createDefaultAIRegistry({ editor, onQuickAction });
			const explain = registry
				.resolve("paragraph", "selection")
				.find((a) => a.id === "explain");

			await explain?.run({
				nodeType: "paragraph", surface: "selection",
				text: "raw",
				metadata: { from: 4, to: 12 },
			});

			expect(stub.insertContentAt).not.toHaveBeenCalled();
		});

		it("skips the editor mutation when the response content is blank", async () => {
			onQuickAction.mockResolvedValue({ status: "done", content: "   " });

			const registry = createDefaultAIRegistry({ editor, onQuickAction });
			const explain = registry
				.resolve("paragraph", "selection")
				.find((a) => a.id === "explain");

			await explain?.run({
				nodeType: "paragraph", surface: "selection",
				text: "raw",
				metadata: { from: 4, to: 12 },
			});

			expect(stub.insertContentAt).not.toHaveBeenCalled();
		});

		it("skips the mutation when the metadata range is missing (no selection)", async () => {
			onQuickAction.mockResolvedValue({ status: "done", content: "body" });

			const registry = createDefaultAIRegistry({ editor, onQuickAction });
			const explain = registry
				.resolve("paragraph", "selection")
				.find((a) => a.id === "explain");

			await explain?.run({ nodeType: "paragraph", surface: "selection", text: "raw" });

			expect(stub.insertContentAt).not.toHaveBeenCalled();
		});
	});

	describe("expand action", () => {
		it("uses the expand action verb in the quick-action request", async () => {
			onQuickAction.mockResolvedValue({ status: "done", content: "more" });

			const registry = createDefaultAIRegistry({ editor, onQuickAction });
			const expand = registry
				.resolve("paragraph", "selection")
				.find((a) => a.id === "expand");

			await expand?.run({
				nodeType: "paragraph", surface: "selection",
				text: "seed",
				metadata: { from: 0, to: 4 },
			});

			expect(onQuickAction).toHaveBeenCalledWith({
				action: "expand",
				selectionText: "seed",
			});
		});
	});

	describe("research action", () => {
		it("calls onQuickAction with action=research and never inserts content", async () => {
			onQuickAction.mockResolvedValue({ status: "done", content: "ignored" });

			const registry = createDefaultAIRegistry({ editor, onQuickAction });
			const research = registry
				.resolve("paragraph", "selection")
				.find((a) => a.id === "research");

			await research?.run({
				nodeType: "paragraph", surface: "selection",
				text: "look this up",
				metadata: { from: 0, to: 12 },
			});

			expect(onQuickAction).toHaveBeenCalledWith({
				action: "research",
				selectionText: "look this up",
			});
			expect(stub.insertContentAt).not.toHaveBeenCalled();
		});

		it("propagates rejections so NodeAIRegistryExtension can surface them", async () => {
			onQuickAction.mockRejectedValue(new Error("queue full"));

			const registry = createDefaultAIRegistry({ editor, onQuickAction });
			const research = registry
				.resolve("paragraph", "selection")
				.find((a) => a.id === "research");

			await expect(
				research?.run({
					nodeType: "paragraph", surface: "selection",
					text: "x",
					metadata: { from: 0, to: 1 },
				}),
			).rejects.toThrow(/queue full/);
		});
	});
});
