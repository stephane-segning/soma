/**
 * PageView — `/spaces/:spaceId/pages/:pageId` route.
 *
 * Loads a draft via `backend.documents.getDraft`, renders the shared
 * `@soma/editor` `DocumentEditor`, and debounces saves back through
 * `backend.documents.upsertDraft` (~500ms).
 *
 * Permission gating: derives an `editable` flag by comparing the local
 * peer id (from `backend.daemon.status()`) against the role of the
 * matching `StoredSpaceMember`. `editor` or `owner` → editable;
 * anything else (and any missing identity) → read-only.
 *
 * The route explicitly *overrides* the AppLayout's `bg-base-200/60`
 * surface — the editor wants a clean `bg-base-100` page background so
 * the prose surface reads as the document itself.
 *
 * Data-loss safety:
 *  - pending debounced saves are cancelled when the route's target
 *    `(spaceId, documentId)` changes, so a save queued on page A never
 *    bleeds into page B;
 *  - on unmount we synchronously flush the last pending save so the
 *    final keystrokes reach the daemon (fire-and-forget, errors logged);
 *  - the editor is force-remounted via `key={spaceId/pageId}` so the
 *    underlying ProseMirror instance never reuses content across docs.
 *
 * Blob uploads (images / files dropped, pasted, or added via the "+"
 * menu) go through `backend.blobs.stage`, the mime-aware handler that
 * zips non-image payloads and hands back a `soma-blob://` URL the
 * editor can render directly (see AGENTS.md's "Blobs" section). Upload
 * failures are *not* caught here — they propagate to `@soma/editor`'s
 * own `uploadAndHydrate`, which already renders an inline error state
 * on the placeholder node (`blob-image/hydrate.ts`, `blob-file.tsx`).
 * Catching and swallowing them here would just hide that surface.
 *
 * "Page link" inserts go through `PageLinkPicker`, a small popover that
 * lists this space's pages (or mints a new sub-page via the shared
 * `createPage()` helper) and hands the chosen page back to
 * `onInsertPageLink`'s pending `(editor, insertPos)`.
 *
 * Title sync: the document schema guarantees the first node is always a
 * `heading` (see `desktop-editor/src/components/document-editor/
 * extensions.ts`), so the page's stored title (`backend.pages.
 * updateTitle`) is kept derived from it — see `../lib/page-title` for
 * the pure extraction/truncation/fallback logic and, importantly, how
 * it decides *not* to clobber a title that no longer tracks the
 * heading (e.g. a future manual rename). That decision is made once,
 * when the page finishes loading, and cached in `titleTrackingRef` for
 * the lifetime of this mount. The title write itself piggybacks on the
 * *same* debounced `persist` call as the content save below — not a
 * second timer — so it shares every one of the cancel/flush/cross-page
 * guarantees documented above for free.
 */

import {
	type BlobFileUploadResult,
	type BlobImageUploadResult,
	DocumentEditor,
	type Editor,
	type JSONContent,
} from "@soma/editor";
import type { StoredSpaceMember } from "@soma/sdk";
import { Empty } from "@soma/ui/components/primitives/empty";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router";
import { PageLinkPicker, type PickedPage } from "../components/page-link-picker";
import { backend } from "../lib/backend";
import { derivePageTitle, titleTracksHeading } from "../lib/page-title";

type LoadState =
	| { phase: "loading" }
	| { phase: "not_found" }
	| { phase: "error"; message: string }
	| { phase: "parse_error" }
	| { phase: "ready"; content: JSONContent; editable: boolean };

const EDITABLE_ROLES = new Set(["owner", "editor"]);

type ParseResult = { ok: true; content: JSONContent } | { ok: false };

function parseContentJson(raw: string): ParseResult {
	try {
		const parsed = JSON.parse(raw) as unknown;
		if (parsed && typeof parsed === "object") {
			return { ok: true, content: parsed as JSONContent };
		}
	} catch {
		// fall through
	}
	return { ok: false };
}

/**
 * Debounced callback with `cancel()` and `flush()` controls.
 *
 * The returned function captures the *latest* args; `flush()` invokes
 * the wrapped fn synchronously with those args and clears the timer.
 * `cancel()` drops the pending invocation entirely.
 *
 * Both controls are stable across renders (the returned object is
 * memoised), so they can safely be referenced from effect cleanups.
 */
type DebouncedFn<Args extends unknown[]> = {
	(...args: Args): void;
	cancel(): void;
	flush(): void;
};

function useDebouncedCallback<Args extends unknown[]>(fn: (...args: Args) => void, wait: number): DebouncedFn<Args> {
	const fnRef = useRef(fn);
	const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const lastArgsRef = useRef<Args | null>(null);

	useEffect(() => {
		fnRef.current = fn;
	}, [fn]);

	const debounced = useRef<DebouncedFn<Args> | null>(null);
	if (!debounced.current) {
		const call = ((...args: Args) => {
			lastArgsRef.current = args;
			if (timerRef.current) clearTimeout(timerRef.current);
			timerRef.current = setTimeout(() => {
				timerRef.current = null;
				const a = lastArgsRef.current;
				lastArgsRef.current = null;
				if (a) fnRef.current(...a);
			}, wait);
		}) as DebouncedFn<Args>;
		call.cancel = () => {
			if (timerRef.current) {
				clearTimeout(timerRef.current);
				timerRef.current = null;
			}
			lastArgsRef.current = null;
		};
		call.flush = () => {
			if (timerRef.current) {
				clearTimeout(timerRef.current);
				timerRef.current = null;
			}
			const a = lastArgsRef.current;
			lastArgsRef.current = null;
			if (a) fnRef.current(...a);
		};
		debounced.current = call;
	}

	return debounced.current;
}

function pickEditable(members: StoredSpaceMember[], peerId: string | null): boolean {
	if (!peerId) return false;
	const me = members.find((m) => m.peerId === peerId);
	if (!me) return false;
	return EDITABLE_ROLES.has(me.role.toLowerCase());
}

/**
 * Frozen-at-load decision for whether `persist` is allowed to write a
 * heading-derived title for `(spaceId, pageId)` — see the module doc
 * comment's "Title sync" note and `../lib/page-title`'s "Unless set
 * explicitly" section for the full reasoning. `lastTitle` is the most
 * recently *confirmed* title (the value we last derived and either
 * loaded or successfully wrote); `persist` only calls `updateTitle`
 * when a freshly derived title differs from it, which both avoids a
 * write on every unrelated body keystroke and naturally retries a
 * previously failed write on the next debounced save.
 */
type TitleTracking = {
	spaceId: string;
	pageId: string;
	enabled: boolean;
	lastTitle: string;
};

/** `bytes` over the wire is `number[]` (`Array.from(uint8)`) — see
 *  `@soma/sdk`'s `blobs.ts` doc comment for why. */
async function fileToBytes(file: File): Promise<number[]> {
	const buffer = await file.arrayBuffer();
	return Array.from(new Uint8Array(buffer));
}

/**
 * Backend `stage` result carries `cid`/`size`/`mime`/`name`/`url` but
 * not pixel dimensions (see `desktop-api::blobs::StageBlobResult`).
 * Probe them client-side, the same way the `@soma/editor` Storybook
 * reference (`document-editor-story/file-utils.ts`) does — from a
 * local `URL.createObjectURL(file)` rather than the just-uploaded
 * `soma-blob://` URL, so it resolves instantly instead of waiting on a
 * second round-trip through the blob protocol handler.
 */
function loadImageDimensions(file: File): Promise<{ width: number; height: number } | null> {
	return new Promise((resolve) => {
		const objectUrl = URL.createObjectURL(file);
		const image = new Image();
		const done = (result: { width: number; height: number } | null) => {
			URL.revokeObjectURL(objectUrl);
			resolve(result);
		};
		image.onload = () => done({ width: image.naturalWidth, height: image.naturalHeight });
		image.onerror = () => done(null);
		image.src = objectUrl;
	});
}

export function PageView() {
	const { t } = useTranslation();
	const navigate = useNavigate();
	const { spaceId, pageId } = useParams<{ spaceId: string; pageId: string }>();
	const [state, setState] = useState<LoadState>({ phase: "loading" });
	// Bumped to force a refetch when the user clicks "Try again" on a
	// parse-error page. Independent of `(spaceId, pageId)` so it doesn't
	// interfere with route-driven reloads.
	const [reloadToken, setReloadToken] = useState(0);

	// Recomputed fresh every load (initial mount, route change, or
	// "Try again") right below — never mutated outside that effect and
	// `persist`'s read of it. See the `TitleTracking` doc comment.
	const titleTrackingRef = useRef<TitleTracking | null>(null);

	// `t()` itself is stable per-language from react-i18next, but reading
	// it here just keeps a plain ref in sync every render so `persist`
	// (a stable `useCallback`, see below) can read the *current*
	// translation without taking a dependency on `t` — the same
	// "ref mirrors latest value" trick `useDebouncedCallback`'s `fnRef`
	// already uses in this file, just inlined instead of a helper.
	const untitledFallbackRef = useRef("");
	untitledFallbackRef.current = t("pages.untitled", "Untitled");

	// biome-ignore lint/correctness/useExhaustiveDependencies: `reloadToken` is intentionally a re-run trigger for "Try again" — it isn't read inside the effect body.
	useEffect(() => {
		if (!spaceId || !pageId) {
			setState({ phase: "not_found" });
			return;
		}
		let cancelled = false;
		setState({ phase: "loading" });
		(async () => {
			try {
				// TODO(P2): `Promise.all` fails the whole load if any one
				// call rejects. The members/status calls should fail open
				// to a read-only render instead of blocking the document.
				//
				// `pages.list` is deliberately *not* in that `Promise.all` —
				// it's read-derived UI sugar (title-sync bookkeeping), not
				// required to render the document, so a failure there
				// shouldn't blow up the whole load. It fails open to `null`,
				// which `titleTracksHeading` below treats as "don't know
				// the current title" → tracking starts disabled rather than
				// risking a clobber.
				const [draft, members, status, pages] = await Promise.all([
					backend.documents.getDraft({ spaceId, documentId: pageId }),
					backend.spaces.members(spaceId),
					backend.daemon.status(),
					backend.pages.list(spaceId).catch((err: unknown) => {
						console.error("[page-view] pages.list failed", err);
						return null;
					}),
				]);
				if (cancelled) return;
				if (!draft) {
					setState({ phase: "not_found" });
					return;
				}
				const parsed = parseContentJson(draft.contentJson);
				if (!parsed.ok) {
					// Surface the parse error rather than silently replacing
					// the on-disk draft with `{type:"doc", content:[]}` on
					// the next save — that would mask the corruption.
					setState({ phase: "parse_error" });
					return;
				}
				const currentTitle = pages?.find((page) => page.pageId === pageId)?.title ?? null;
				titleTrackingRef.current = {
					spaceId,
					pageId,
					// `currentTitle == null` covers both "pages.list failed"
					// and "this page id isn't in its own space's list" (should
					// never happen, but fail closed rather than guess) —
					// either way we don't know enough to say the title is
					// still the default, so we don't touch it.
					enabled:
						currentTitle != null &&
						titleTracksHeading(currentTitle, parsed.content, { fallback: untitledFallbackRef.current }),
					lastTitle: currentTitle ?? derivePageTitle(parsed.content, { fallback: untitledFallbackRef.current }),
				};
				setState({
					phase: "ready",
					content: parsed.content,
					editable: pickEditable(members, status.peerId),
				});
			} catch (err) {
				if (cancelled) return;
				const message = err instanceof Error ? err.message : String(err);
				setState({ phase: "error", message });
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [spaceId, pageId, reloadToken]);

	// `persist` is keyed by the `(spaceId, pageId)` baked into the
	// closure at queue time. The debounced wrapper captures *args* —
	// here those args are the doc target plus the JSON content — so a
	// timer fired after a route change still writes back to the doc it
	// was queued against. Combined with `cancel()` on route change,
	// this gives us a belt-and-braces guarantee against cross-page
	// bleed.
	const persist = useCallback((targetSpaceId: string, targetPageId: string, next: JSONContent) => {
		void backend.documents
			.upsertDraft({
				spaceId: targetSpaceId,
				documentId: targetPageId,
				contentJson: JSON.stringify(next),
				updatedAtMs: Date.now(),
			})
			.catch((err: unknown) => {
				// Swallow with a console signal — toast surface is a later
				// phase. The next successful save will make the doc
				// consistent again; we don't want to flip the editor into
				// an error state for a transient daemon hiccup.
				console.error("[page-view] upsertDraft failed", err);
			});

		// Title sync — piggybacks on this same debounced call rather than
		// running its own timer (see the module doc comment). Guarded by
		// `targetSpaceId`/`targetPageId` matching the tracking snapshot for
		// the same cross-page-bleed reason `debouncedPersist.flush()` is
		// guarded above: a flush fired after navigating away still carries
		// the *old* page's ids, and `titleTrackingRef` at that point still
		// holds the old page's snapshot too (the new page's load effect
		// can't have resolved yet — synchronous effects run to completion
		// before any of this tick's async work continues), so the two stay
		// correctly paired without any extra bookkeeping.
		const tracking = titleTrackingRef.current;
		if (tracking?.spaceId === targetSpaceId && tracking.pageId === targetPageId && tracking.enabled) {
			const derived = derivePageTitle(next, { fallback: untitledFallbackRef.current });
			if (derived !== tracking.lastTitle) {
				void backend.pages
					.updateTitle({ spaceId: targetSpaceId, pageId: targetPageId, title: derived })
					.then((updated) => {
						// Confirmed by the daemon, not assumed — if this
						// somehow differs from `derived` (e.g. future
						// server-side normalization), later comparisons stay
						// correct either way.
						tracking.lastTitle = updated?.title ?? derived;
					})
					.catch((err: unknown) => {
						// Same swallow-with-log convention as the content
						// save above. `tracking.lastTitle` deliberately stays
						// unchanged on failure, so the very next debounced
						// save (even one triggered by an unrelated body
						// edit) retries this write instead of silently
						// giving up.
						console.error("[page-view] pages.updateTitle failed", err);
					});
			}
		}
	}, []);

	const debouncedPersist = useDebouncedCallback(persist, 500);

	// Flush any pending save targeted at the *previous* document when
	// the route changes within the editor (page A → page B). The args
	// in the pending call were baked to A's `(spaceId, pageId, content)`
	// at queue time, so flushing writes A's last keystrokes back to A's
	// draft before we move on — `cancel()` here would silently discard
	// them. We track the previous params in a ref so this only fires on
	// an actual route change.
	const prevRouteRef = useRef<{ spaceId?: string; pageId?: string }>({
		spaceId,
		pageId,
	});
	useEffect(() => {
		const prev = prevRouteRef.current;
		if (prev.spaceId !== spaceId || prev.pageId !== pageId) {
			debouncedPersist.flush();
			prevRouteRef.current = { spaceId, pageId };
		}
	}, [spaceId, pageId, debouncedPersist]);

	// On real unmount (leaving the editor entirely), synchronously flush
	// the pending save so the last few keystrokes reach the daemon. The
	// `persist` call is fire-and-forget — we can't await in a cleanup,
	// and React 18+ strict-mode forbids returning a promise here. Errors
	// inside `persist` are already routed through `console.error`.
	useEffect(() => {
		return () => {
			debouncedPersist.flush();
		};
	}, [debouncedPersist]);

	const handleChange = useCallback(
		(next: JSONContent) => {
			if (!spaceId || !pageId) return;
			debouncedPersist(spaceId, pageId, next);
		},
		[debouncedPersist, spaceId, pageId],
	);

	const backToSpace = useCallback(() => {
		if (spaceId) navigate(`/spaces/${spaceId}`);
		else navigate("/spaces");
	}, [navigate, spaceId]);

	const retryLoad = useCallback(() => {
		setReloadToken((n) => n + 1);
	}, []);

	// Root surface — explicitly `bg-base-100` so the AppLayout's
	// `bg-base-200/60` main tint doesn't bleed into the page editor.
	const root = "min-h-full w-full bg-base-100";
	const inner = "mx-auto w-full max-w-4xl px-8 py-10";

	if (state.phase === "loading") {
		return (
			<div className={root}>
				<div className={inner}>
					<Empty headline={t("pages.page_view.loading")} />
				</div>
			</div>
		);
	}
	if (state.phase === "error") {
		return (
			<div className={root}>
				<div className={inner}>
					<Empty headline={t("pages.page_view.error")} subtext={state.message} />
				</div>
			</div>
		);
	}
	if (state.phase === "parse_error") {
		return (
			<div className={root}>
				<div className={inner}>
					<Empty
						cta={
							<button className="btn btn-primary btn-sm" onClick={retryLoad} type="button">
								{t("pages.page_view.try_again")}
							</button>
						}
						headline={t("pages.page_view.parse_error")}
					/>
				</div>
			</div>
		);
	}
	if (state.phase === "not_found") {
		return (
			<div className={root}>
				<div className={inner}>
					<Empty
						cta={
							<button className="btn btn-primary btn-sm" onClick={backToSpace} type="button">
								{t("pages.page_view.back_to_space")}
							</button>
						}
						headline={t("pages.page_view.not_found")}
					/>
				</div>
			</div>
		);
	}

	// `state.phase === "ready"` is only ever set after the load effect's
	// own `!spaceId || !pageId` guard passed, so both are always defined
	// here at runtime — but that invariant lives in a different closure
	// than this render, so TS can't see it. Re-checking narrows the
	// types for the `PageEditor` props below without resorting to a
	// non-null assertion.
	if (!spaceId || !pageId) {
		return (
			<div className={root}>
				<div className={inner}>
					<Empty headline={t("pages.page_view.not_found")} />
				</div>
			</div>
		);
	}

	// Force-remount the editor when the route's target document changes
	// so the underlying ProseMirror instance never carries old content
	// into a new doc. `DocumentEditor` consumes `initialContent` only at
	// init — without the `key`, a navigation within `/spaces/:s/pages/*`
	// would keep showing the previous page's body.
	return (
		<PageEditor
			content={state.content}
			editable={state.editable}
			key={`${spaceId}/${pageId}`}
			onChange={handleChange}
			pageId={pageId}
			spaceId={spaceId}
		/>
	);
}

function PageEditor({
	content,
	editable,
	onChange,
	pageId,
	spaceId,
}: {
	content: JSONContent;
	editable: boolean;
	onChange: (next: JSONContent) => void;
	pageId: string;
	spaceId: string;
}) {
	const navigate = useNavigate();

	const uploadImage = useCallback(
		async (file: File): Promise<BlobImageUploadResult> => {
			const [bytes, dimensions] = await Promise.all([fileToBytes(file), loadImageDimensions(file)]);
			const staged = await backend.blobs.stage({
				bytes,
				docId: pageId,
				fileName: file.name,
				mime: file.type || "application/octet-stream",
				spaceId,
			});
			return {
				cid: staged.cid,
				height: dimensions?.height,
				mime: staged.mime,
				name: staged.name,
				size: staged.size,
				src: staged.url,
				variants: staged.variants?.map((variant) => ({
					cid: variant.cid,
					mime: variant.mime,
					name: variant.name,
					size: variant.size,
					url: variant.url,
					width: variant.width ?? undefined,
					height: variant.height ?? undefined,
				})),
				width: dimensions?.width,
			};
		},
		[pageId, spaceId],
	);

	const uploadFile = useCallback(
		async (file: File): Promise<BlobFileUploadResult> => {
			const bytes = await fileToBytes(file);
			const staged = await backend.blobs.stage({
				bytes,
				docId: pageId,
				fileName: file.name,
				mime: file.type || "application/octet-stream",
				spaceId,
			});
			return { cid: staged.cid, href: staged.url, mime: staged.mime, name: staged.name, size: staged.size };
		},
		[pageId, spaceId],
	);

	// Read-only viewers can still follow a page link (pure navigation,
	// no mutation) — this one is intentionally not gated by `editable`.
	const onOpenPageLink = useCallback(
		(linkedPageId: string, _title?: string, href?: string) => {
			navigate(href ?? `/spaces/${spaceId}/pages/${linkedPageId}`);
		},
		[navigate, spaceId],
	);

	const onRenamePageLink = useCallback(
		async (linkedPageId: string, nextTitle: string): Promise<string | null> => {
			try {
				const updated = await backend.pages.updateTitle({ spaceId, pageId: linkedPageId, title: nextTitle });
				return updated?.title ?? null;
			} catch (err) {
				// Same swallow-with-log convention as `persist` above — the
				// link's displayed title just stays unchanged on failure.
				console.error("[page-view] pages.updateTitle failed", err);
				return null;
			}
		},
		[spaceId],
	);

	// `onInsertPageLink` only has to open the picker and remember which
	// `(editor, insertPos)` it was requested for — `ContextMenu` (the
	// add-menu host) already closes itself synchronously on click
	// regardless of when this promise settles, so there's nothing to
	// await here. The actual `insertContentAt` happens later, whenever
	// `PageLinkPicker` calls back via `onPick`/`onClose`.
	const pendingInsertRef = useRef<{ editor: Editor; insertPos: number } | null>(null);
	const [pickerOpen, setPickerOpen] = useState(false);
	const onInsertPageLink = useCallback(async (targetEditor: Editor, insertPos: number) => {
		pendingInsertRef.current = { editor: targetEditor, insertPos };
		setPickerOpen(true);
	}, []);
	const closePicker = useCallback(() => {
		pendingInsertRef.current = null;
		setPickerOpen(false);
	}, []);
	const handlePagePicked = useCallback((picked: PickedPage) => {
		const pending = pendingInsertRef.current;
		pendingInsertRef.current = null;
		setPickerOpen(false);
		if (!pending) return;
		pending.editor
			.chain()
			.focus()
			.insertContentAt(pending.insertPos, {
				type: "pageLink",
				attrs: { pageId: picked.pageId, title: picked.title, href: picked.href },
			})
			.run();
	}, []);

	// Read-only path: pass `editable={false}` to `DocumentEditor` so
	// ProseMirror itself disables `contenteditable` on the surface. The
	// previous `inert` cage removed the entire subtree from the a11y
	// tree *and* blocked text selection; `editable={false}` keeps the
	// prose selectable and screen-reader-reachable. The intrinsic
	// `contenteditable="false"` ProseMirror sets is what AT actually
	// reads, so we don't need a redundant `aria-readonly` here.
	//
	// Mutating capabilities (uploads, page-link insert/rename) are only
	// wired when `editable` — mirrors the existing `onChange` gating
	// just below so a read-only viewer can't trigger a write even if
	// some other `@soma/editor` surface (e.g. the drag-handle) rendered
	// for them.
	return (
		<div className="min-h-full w-full bg-base-100">
			<div className="mx-auto w-full max-w-4xl px-8 py-10">
				<DocumentEditor
					editable={editable}
					initialContent={content}
					onChange={editable ? onChange : undefined}
					onInsertPageLink={editable ? onInsertPageLink : undefined}
					onOpenPageLink={onOpenPageLink}
					onRenamePageLink={editable ? onRenamePageLink : undefined}
					uploadFile={editable ? uploadFile : undefined}
					uploadImage={editable ? uploadImage : undefined}
				/>
			</div>
			<PageLinkPicker
				currentPageId={pageId}
				onClose={closePicker}
				onPick={handlePagePicked}
				open={pickerOpen}
				spaceId={spaceId}
			/>
		</div>
	);
}
