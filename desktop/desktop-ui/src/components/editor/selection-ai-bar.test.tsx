/**
 * Regression tests for SelectionAIBar dismissal behaviour.
 *
 * The original implementation gated *every* keydown — including Escape —
 * on focus living inside the bar. As soon as the user clicked outside
 * the bar (typical when the AI bar opened over a selection), focus left
 * and Escape stopped working. There was also no click-outside dismissal,
 * so the bar could get stuck on screen until page refresh.
 *
 * These tests pin the fix:
 *   1. Escape fires `onClose` regardless of where the keydown target sits.
 *   2. A mousedown outside the bar's container fires `onClose`.
 *   3. A mousedown inside the bar does NOT fire `onClose`.
 */
import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SomaIntlProvider } from "../../i18n/intl-provider";
import type { NodeAIRegistry, NodeAIAction } from "./node-ai-registry.types";
import { SelectionAIBar } from "./selection-ai-bar";

function makeRegistry(actions: NodeAIAction[] = []): NodeAIRegistry {
	return {
		resolve: () => actions,
	} as unknown as NodeAIRegistry;
}

function renderBar(onClose = vi.fn()) {
	const utils = render(
		<SomaIntlProvider>
			<SelectionAIBar
				nodeType="paragraph"
				onClose={onClose}
				registry={makeRegistry()}
				selectedText="hello world"
			/>
		</SomaIntlProvider>,
	);
	return { ...utils, onClose };
}

describe("SelectionAIBar dismissal", () => {
	it("fires onClose on Escape even when focus is outside the bar", () => {
		const { onClose } = renderBar();

		// Move focus off the bar's input — mirrors the user clicking the
		// editor body before pressing Escape, which used to break Escape.
		document.body.focus();

		fireEvent.keyDown(document.body, { key: "Escape" });

		expect(onClose).toHaveBeenCalledTimes(1);
	});

	it("fires onClose on Escape from inside the bar's input", () => {
		const { onClose, getByPlaceholderText } = renderBar();

		const input = getByPlaceholderText(/ask ai/i);
		fireEvent.keyDown(input, { key: "Escape" });

		expect(onClose).toHaveBeenCalledTimes(1);
	});

	it("fires onClose on mousedown outside the bar's container", () => {
		const { onClose } = renderBar();

		fireEvent.mouseDown(document.body);

		expect(onClose).toHaveBeenCalledTimes(1);
	});

	it("does NOT fire onClose on mousedown inside the bar", () => {
		const { onClose, getByRole } = renderBar();

		const dialog = getByRole("dialog");
		fireEvent.mouseDown(dialog);

		expect(onClose).not.toHaveBeenCalled();
	});
});
