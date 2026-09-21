/**
 * SpacesRailContainer — left-column wrapper around `@soma/ui`'s
 * `SpacesRail`. Pulls the real space list from the SDK and re-fetches
 * on the small handful of domain events that can change the local
 * inventory (today: `join-decision`).
 *
 * The previous Phase-1 version rendered a hard-coded mock list; this
 * version is the production wiring.
 *
 * `onCreate` (the rail's trailing `+` button) calls
 * `backend.spaces.create` directly and navigates to the new space. The
 * same "New Space" command reachable via ⌘⇧N / the native menu / the
 * command palette (`CommandPaletteRoot`) does the identical two steps —
 * they're just not shared as one function since there's nothing to
 * factor beyond a single SDK call. On failure this rail has no room for
 * inline text (it's a 52px icon strip), so — same as the global
 * command — it navigates to `/spaces` with an inline `notice`
 * (ADR-0005 §6) rather than showing nothing or a toast.
 */
import { type SpaceRailItem, SpacesRail } from "@soma/ui/components/nav/spaces-rail";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router";
import { parseActiveSpaceId } from "../lib/active-space";
import { backend } from "../lib/backend";

/** Generous upper bound — the SDK paginates at 50 by default, but the
 *  rail treats the result as the full inventory. Anything beyond ~1000
 *  spaces wouldn't fit in the rail UX anyway; revisit if that becomes
 *  a real ceiling. */
const SPACES_LIST_LIMIT = 1000;

/** Domain-event kinds that can change the local space inventory. Today
 *  only `join-decision` causes a meaningful change for the rail; other
 *  events (`document-changed`, `pages-changed`, `bot-status-changed`,
 *  …) are higher-frequency and orthogonal. Keep this list as narrow as
 *  possible. */
const SPACE_LIST_AFFECTING: ReadonlySet<string> = new Set(["join-decision"]);

/** Two-letter monogram for the rail icon. Codepoint-safe so emojis and
 *  other multi-byte glyphs don't get sliced mid-surrogate. */
function monogram(displayName: string): string {
	const cleaned = displayName.trim();
	if (!cleaned) return "··";
	const words = cleaned.split(/\s+/);
	if (words.length === 1) {
		// "Personal" → "PE"; "🌱garden" → "🌱g"
		return Array.from(cleaned).slice(0, 2).join("").toUpperCase();
	}
	// "My Team Space" → "MT" (first codepoint of each of the first two words)
	const first = Array.from(words[0])[0] ?? "";
	const second = Array.from(words[1])[0] ?? "";
	return `${first}${second}`.toUpperCase();
}

export function SpacesRailContainer() {
	const navigate = useNavigate();
	const { t } = useTranslation();
	// NOT `useParams()`. This component renders inside a column
	// `AppLayout` passes to `DesktopShell` (a *sibling* of `<Outlet />`),
	// so route params from `spaces/:spaceId` never reach it and
	// `useParams()` resolves to `{}`. Derive the active space from the
	// live pathname instead — same fix as `chat-panel`, `nav-panel` and
	// `bots-panel`.
	const { pathname } = useLocation();
	const spaceId = parseActiveSpaceId(pathname) ?? undefined;
	const [items, setItems] = useState<SpaceRailItem[] | null>(null);

	// Monotonic request counter. The most recently-issued `load()` call's
	// id is recorded in `latestRequestRef`; older in-flight responses
	// compare their id against it and discard themselves so a slow earlier
	// response can't overwrite a faster later one.
	const latestRequestRef = useRef(0);
	// Guards against a double-click firing two concurrent creates — the
	// rail's `+` button has no busy/disabled visual of its own.
	const creatingRef = useRef(false);

	useEffect(() => {
		let cancelled = false;

		async function load() {
			const requestId = ++latestRequestRef.current;
			try {
				const result = await backend.spaces.list({ q: null, limit: SPACES_LIST_LIMIT });
				if (cancelled || requestId !== latestRequestRef.current) return;
				setItems(
					result.spaces.map((s) => ({
						id: s.spaceId,
						icon: monogram(s.displayName),
						name: s.displayName,
					})),
				);
			} catch (err) {
				if (cancelled || requestId !== latestRequestRef.current) return;
				console.error("[spaces-rail] list failed", err);
				setItems([]);
			}
		}

		void load();

		const unsubscribe = backend.events.onDomain((event) => {
			if (SPACE_LIST_AFFECTING.has(event.kind)) {
				void load();
			}
		});

		return () => {
			cancelled = true;
			unsubscribe();
		};
	}, []);

	const safeItems = useMemo(() => items ?? [], [items]);

	const handleCreate = useCallback(async () => {
		if (creatingRef.current) return;
		creatingRef.current = true;
		try {
			const space = await backend.spaces.create(null);
			navigate(`/spaces/${space.spaceId}`);
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			navigate("/spaces", {
				state: {
					notice: t("pages.spaces_index.create_error", "Couldn't create a space: {{message}}", { message }),
				},
			});
		} finally {
			creatingRef.current = false;
		}
	}, [navigate, t]);

	return (
		<SpacesRail
			activeId={spaceId ?? null}
			// Transparent gutter — the rail carries no fill of its own, so it
			// reveals the shell's unified canvas. Only the space tiles + the
			// hairline `border-r` divider remain visible. (`SpacesRail`
			// defaults to `bg-base-100`; twMerge lets this override win.)
			className="bg-transparent"
			items={safeItems}
			onCreate={() => void handleCreate()}
			onSelect={(id) => navigate(`/spaces/${id}`)}
		/>
	);
}
