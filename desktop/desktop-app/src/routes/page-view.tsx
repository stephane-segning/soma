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
	| { phase: "ready"; content: JSONContent; editable: boolean };

const EDITABLE_ROLES = new Set(["owner", "editor"]);

function parseContentJson(raw: string): JSONContent {
	try {
		const parsed = JSON.parse(raw) as unknown;
		if (parsed && typeof parsed === "object") return parsed as JSONContent;
	} catch {
		// fall through — surface as empty doc rather than crash the editor
	}
	return { type: "doc", content: [] };
}

/**
 * Tiny inline debounce. Avoids pulling a dep just to schedule the next
 * `upsertDraft` ~500ms after the last keystroke. The `flush()` returned
 * here isn't used today but keeps the helper general.
 */
function useDebouncedCallback<Args extends unknown[]>(
	fn: (...args: Args) => void,
	wait: number,
): (...args: Args) => void {
	const fnRef = useRef(fn);
	const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	useEffect(() => {
		fnRef.current = fn;
	}, [fn]);
	useEffect(
		() => () => {
			if (timerRef.current) clearTimeout(timerRef.current);
		},
		[],
	);
	return useCallback(
		(...args: Args) => {
			if (timerRef.current) clearTimeout(timerRef.current);
			timerRef.current = setTimeout(() => {
				fnRef.current(...args);
			}, wait);
		},
		[wait],
	);
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

	useEffect(() => {
		if (!spaceId || !pageId) {
			setState({ phase: "not_found" });
			return;
		}
		let cancelled = false;
		(async () => {
			try {
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
				setState({
					phase: "ready",
					content: parseContentJson(draft.contentJson),
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
	}, [spaceId, pageId]);

	const persist = useCallback(
		(next: JSONContent) => {
			if (!spaceId || !pageId) return;
			void backend.documents
				.upsertDraft({
					spaceId,
					documentId: pageId,
					contentJson: JSON.stringify(next),
					updatedAtMs: Date.now(),
				})
				.catch((err: unknown) => {
					// Swallow with a console signal — toast surface is a later
					// phase. The next successful save will make the doc consistent
					// again; we don't want to flip the editor into an error state
					// for a transient daemon hiccup.
					console.error("[page-view] upsertDraft failed", err);
				});
		},
		[spaceId, pageId],
	);

	const debouncedPersist = useDebouncedCallback(persist, 500);

	const handleChange = useCallback(
		(next: JSONContent) => {
			debouncedPersist(next);
		},
		[debouncedPersist],
	);

	const backToSpace = useCallback(() => {
		if (spaceId) navigate(`/spaces/${spaceId}`);
		else navigate("/spaces");
	}, [navigate, spaceId]);

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

	return <PageEditor content={state.content} editable={state.editable} onChange={handleChange} />;
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
	// `DocumentEditor` doesn't currently expose an `editable`/`readOnly`
	// prop, so we wrap the surface in an `inert` cage for the read-only
	// path. The visual prose stays fully readable and selectable text
	// remains selectable via the underlying ProseMirror — but keyboard
	// and pointer input are both gated by `inert`, which is exactly the
	// read-only behaviour we want until the editor grows a first-class
	// `editable` prop.
	return (
		<div className="min-h-full w-full bg-base-100">
			<div className="mx-auto w-full max-w-4xl px-8 py-10">
				{editable ? (
					<DocumentEditor initialContent={content} onChange={onChange} />
				) : (
					<div className="select-text" inert>
						<DocumentEditor initialContent={content} />
					</div>
				)}
			</div>
		</div>
	);
}
