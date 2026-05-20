/**
 * Regression guard — no popover/menu component should re-introduce
 * `whileHover: { scale }`, `whileTap: { scale }`, or `scale: <1` entry
 * animations. The user reported that those entry/hover scales read as
 * a "zoom on hover" effect because hover/selection is what triggers
 * the surface; the polish pass stripped them all.
 *
 * This is a source-level check (cheap, fast) rather than a render
 * snapshot — the goal is to catch a future PR that copy-pastes an old
 * `initial={{ scale: 0.96 }}` pattern into a new menu.
 *
 * Sources are loaded via Vite's `?raw` query so the test stays inside
 * the renderer-flavoured tsconfig (no `node:fs` needed).
 */
import { describe, expect, it } from "vitest";

// Eager raw imports — Vite returns the file contents as a string. The
// path is relative to this file. Each entry corresponds to one guarded
// component file.
import selectionBubble from "../editor/selection-bubble.tsx?raw";
import selectionAiBar from "../editor/selection-ai-bar.tsx?raw";
import slashMenu from "../editor/slash-menu.tsx?raw";
import menuShell from "./menu-shell.tsx?raw";
import contextMenu from "./context-menu.tsx?raw";
import bubbleToolbar from "./bubble-toolbar.tsx?raw";
import commandPalette from "./command-palette.tsx?raw";
import windowChrome from "../layout/window-chrome.tsx?raw";

const GUARDED: Record<string, string> = {
	"editor/selection-bubble.tsx": selectionBubble,
	"editor/selection-ai-bar.tsx": selectionAiBar,
	"editor/slash-menu.tsx": slashMenu,
	"overlays/menu-shell.tsx": menuShell,
	"overlays/context-menu.tsx": contextMenu,
	"overlays/bubble-toolbar.tsx": bubbleToolbar,
	"overlays/command-palette.tsx": commandPalette,
	"layout/window-chrome.tsx": windowChrome,
};

// Patterns that re-introduce the "zoom on hover/enter" feel.
const FORBIDDEN_PATTERNS: Array<{ name: string; regex: RegExp }> = [
	{ name: "whileHover scale", regex: /whileHover\s*=\s*\{\{[^}]*\bscale\b/ },
	{ name: "whileTap scale", regex: /whileTap\s*=\s*\{\{[^}]*\bscale\b/ },
	{ name: "initial scale < 1", regex: /initial\s*=\s*\{\{[^}]*scale\s*:\s*0\./ },
	{ name: "exit scale < 1", regex: /exit\s*=\s*\{\{[^}]*scale\s*:\s*0\./ },
];

describe("popovers: no scale-based hover/entry transforms", () => {
	for (const [file, contents] of Object.entries(GUARDED)) {
		it(`${file} contains no forbidden scale patterns`, () => {
			for (const { name, regex } of FORBIDDEN_PATTERNS) {
				expect(
					regex.test(contents),
					`${file} contains "${name}" — see no-scale-animations.test.ts for context.`,
				).toBe(false);
			}
		});
	}
});
