/**
 * page-title — derives a page's display title from its document's first
 * heading, per the tracked follow-up in
 * `planning/active/plan-02-tiptap-editor.md`: "the document format
 * implies the first line is the title; use that first line as the
 * default page title when the user hasn't set one explicitly."
 *
 * Zero-dependency on purpose (same rationale as `window-title-format.ts`):
 * `desktop-app`'s vitest config runs in a `node` environment with no DOM,
 * so a pure, import-free module is what stays directly testable. The
 * `MinimalProseMirrorNode` type below is a structural subset of
 * `@tiptap/core`'s `JSONContent` — callers pass a real `JSONContent`
 * value (see `page-view.tsx`) and TypeScript's structural typing accepts
 * it with no cast, without this module importing `@tiptap/core` itself.
 *
 * Schema guarantee this relies on: `desktop-editor/src/components/
 * document-editor/extensions.ts` sets `Document.extend({ content:
 * "heading block*" })`, so every document's first node is always a
 * `heading`, and Tiptap's `Heading` extension declares `content:
 * "inline*"` — a heading can only ever contain text runs (with marks
 * like bold/italic/link) and inline atoms (e.g. the editor's
 * `textRotate` node), never block content. `extractHeadingText` below
 * only reads `text` leaves, so an inline atom with no text content
 * (there is no realistic case of a user's title consisting solely of a
 * decorative inline atom) simply contributes nothing rather than
 * throwing.
 *
 * ## "Unless set explicitly"
 *
 * The plan frames the heading-derived title as a *default* — implying a
 * future rename should stick instead of being silently overwritten on
 * the next keystroke. There's no `explicit`/`is_custom` column on the
 * `pages` table (see AGENTS.md's storage schema section) and no rename
 * UI today (`TreePopover` is `canRename: false` in `desktop-ui`), so
 * there's nowhere to persist an "explicit" bit without a backend change
 * — out of scope here (see the desktop-app PR description for the exact
 * change this would need).
 *
 * Instead, `titleTracksHeading` gives callers a way to detect divergence
 * *without* new persistence: a title is "still tracking the heading" if
 * it equals what `derivePageTitle` would produce from the current
 * document right now. `page-view.tsx` calls this once when a page
 * finishes loading and freezes the result (in a ref) for that mount:
 *
 *  - stored title === derived title  → tracking stays on; every
 *    subsequent debounced save re-derives and writes the title as the
 *    heading changes (the normal "default title" behavior).
 *  - stored title !== derived title  → something (a future rename
 *    affordance, or another client) set a title that diverges from the
 *    heading, so tracking turns off for the rest of that mount — no
 *    write ever clobbers it.
 *
 * This is a pragmatic heuristic, not a durable "explicit" flag: it
 * re-evaluates from scratch on every page load rather than remembering
 * a decision across sessions/devices. That's the correct trade-off
 * *today* (100% of titles are implicit — nothing to protect yet), and
 * degrades safely once a rename UI exists (any real rename to text that
 * differs from the heading — the whole point of renaming — flips
 * tracking off immediately, repo-wide, the next time each client loads
 * the page).
 */

export type MinimalProseMirrorNode = {
	type?: string;
	text?: string;
	content?: MinimalProseMirrorNode[];
};

/** Generous single-line ceiling for a stored page title. Pages/window
 *  titles/command-palette rows are all single-line UI (realistically
 *  60-80 visible characters before CSS truncation kicks in) — 200
 *  never clips a real heading, it only guards against a pathological
 *  paste turning into a mile-long window title / DB row. */
export const PAGE_TITLE_MAX_LENGTH = 200;

export type DerivePageTitleOptions = {
	/** Shown when the heading has no text (fresh page, or cleared by the user). */
	fallback: string;
	maxLength?: number;
};

/** Collapses all whitespace runs (including newlines — reachable only via
 *  a pasted string today, since no `hardBreak` extension is registered)
 *  to a single space and trims the ends. */
function collapseWhitespace(text: string): string {
	return text.replace(/\s+/g, " ").trim();
}

/** Flattens a node's inline `content` into plain text, depth-first.
 *  Only `text` nodes contribute; any other inline node (an atom like
 *  `textRotate`) is skipped rather than throwing, since it carries no
 *  `text` field. */
function flattenText(node: MinimalProseMirrorNode): string {
	if (node.type === "text") return node.text ?? "";
	if (!node.content) return "";
	return node.content.map(flattenText).join("");
}

/**
 * Raw text of the document's first heading, whitespace-collapsed and
 * trimmed — `""` if there is no text (empty heading, missing/malformed
 * doc, or a first node that somehow isn't a `heading`). Not truncated
 * and not defaulted; see `derivePageTitle` for the full pipeline.
 */
export function extractHeadingText(doc: MinimalProseMirrorNode | null | undefined): string {
	const heading = doc?.content?.[0];
	if (!heading || heading.type !== "heading") return "";
	return collapseWhitespace(flattenText(heading));
}

/** Truncates to `maxLength`, trimming any trailing whitespace the cut
 *  exposes before appending a single ellipsis character (not counted
 *  against `maxLength`, matching how CSS `text-overflow: ellipsis`
 *  doesn't eat into the visible width either). Text at or under the
 *  limit is returned unchanged. */
export function truncateTitle(text: string, maxLength: number = PAGE_TITLE_MAX_LENGTH): string {
	if (text.length <= maxLength) return text;
	return `${text.slice(0, maxLength).trimEnd()}…`;
}

/**
 * The title `page-view.tsx` should store for a document: the first
 * heading's text if there is any (collapsed, trimmed, truncated), else
 * `options.fallback`.
 */
export function derivePageTitle(
	doc: MinimalProseMirrorNode | null | undefined,
	options: DerivePageTitleOptions,
): string {
	const extracted = extractHeadingText(doc);
	if (!extracted) return options.fallback;
	return truncateTitle(extracted, options.maxLength ?? PAGE_TITLE_MAX_LENGTH);
}

/**
 * `true` when `currentTitle` is exactly what `derivePageTitle` would
 * produce from `doc` right now — i.e. nothing has set the title away
 * from the heading-derived default. See the module doc comment's
 * "Unless set explicitly" section for how callers use this.
 */
export function titleTracksHeading(
	currentTitle: string,
	doc: MinimalProseMirrorNode | null | undefined,
	options: DerivePageTitleOptions,
): boolean {
	return currentTitle === derivePageTitle(doc, options);
}
