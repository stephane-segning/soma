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
 */

import { DocumentEditor, type JSONContent } from "@soma/editor";
import type { StoredSpaceMember } from "@soma/sdk";
import { Empty } from "@soma/ui/components/primitives/empty";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router";
import { backend } from "../lib/backend";

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

export function PageView() {
	const { t } = useTranslation();
	const navigate = useNavigate();
	const { spaceId, pageId } = useParams<{ spaceId: string; pageId: string }>();
	const [state, setState] = useState<LoadState>({ phase: "loading" });
	// Bumped to force a refetch when the user clicks "Try again" on a
	// parse-error page. Independent of `(spaceId, pageId)` so it doesn't
	// interfere with route-driven reloads.
	const [reloadToken, setReloadToken] = useState(0);

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
				const [draft, members, status] = await Promise.all([
					backend.documents.getDraft({ spaceId, documentId: pageId }),
					backend.spaces.members(spaceId),
					backend.daemon.status(),
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
	}, []);

	const debouncedPersist = useDebouncedCallback(persist, 500);

	// Cancel any pending save targeted at the *previous* document when
	// the route changes within the editor (page A → page B). We track
	// the previous params in a ref so we only fire `cancel()` on an
	// actual route change — *not* on the final unmount, where we want
	// the flush effect below to win and persist the last keystrokes.
	const prevRouteRef = useRef<{ spaceId?: string; pageId?: string }>({
		spaceId,
		pageId,
	});
	useEffect(() => {
		const prev = prevRouteRef.current;
		if (prev.spaceId !== spaceId || prev.pageId !== pageId) {
			debouncedPersist.cancel();
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
		/>
	);
}

function PageEditor({
	content,
	editable,
	onChange,
}: {
	content: JSONContent;
	editable: boolean;
	onChange: (next: JSONContent) => void;
}) {
	// Read-only path: pass `editable={false}` to `DocumentEditor` so
	// ProseMirror itself disables `contenteditable` on the surface. The
	// previous `inert` cage removed the entire subtree from the a11y
	// tree *and* blocked text selection; `editable={false}` keeps the
	// prose selectable and screen-reader-reachable. The intrinsic
	// `contenteditable="false"` ProseMirror sets is what AT actually
	// reads, so we don't need a redundant `aria-readonly` here.
	return (
		<div className="min-h-full w-full bg-base-100">
			<div className="mx-auto w-full max-w-4xl px-8 py-10">
				<DocumentEditor editable={editable} initialContent={content} onChange={editable ? onChange : undefined} />
			</div>
		</div>
	);
}
