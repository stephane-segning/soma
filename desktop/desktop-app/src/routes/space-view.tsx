/**
 * SpaceView — `/spaces/:spaceId`, the space's home surface.
 *
 * Pages themselves live in the left rail's `PagesPanel`; members/info
 * are their own routes. This screen's one real job today is to be a
 * landing spot with an inline "New Page" affordance — the first way a
 * brand-new space (zero pages) can get one at all (AGENTS.md: inline
 * status line, not a centered placard, since this screen keeps its own
 * header).
 *
 * It's also the inline-error surface (ADR-0005 §6 — no toast-only
 * feedback for primary actions) for the *global* "New Page" command
 * (native menu / ⌘N / command palette): that command can run before
 * this route is even mounted, so on failure it navigates here with a
 * `notice` in router state rather than a local error — see
 * `useNavigationNotice()`. A failure from clicking this screen's own
 * button, by contrast, stays in local `createError` state right next
 * to the button that caused it.
 */
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router";
import { createPage } from "../lib/create-page";
import { useNavigationNotice } from "../lib/use-navigation-notice";

export function SpaceView() {
	const { t } = useTranslation();
	const navigate = useNavigate();
	const { spaceId } = useParams<{ spaceId: string }>();
	const notice = useNavigationNotice();
	const [creating, setCreating] = useState(false);
	const [createError, setCreateError] = useState<string | null>(null);

	const handleCreatePage = useCallback(async () => {
		if (!spaceId) return;
		setCreating(true);
		setCreateError(null);
		try {
			const page = await createPage(spaceId, t("pages.untitled", "Untitled"));
			navigate(`/spaces/${spaceId}/pages/${page.pageId}`);
		} catch (err) {
			setCreateError(err instanceof Error ? err.message : String(err));
			setCreating(false);
		}
	}, [spaceId, navigate, t]);

	// A fresh local failure is always more relevant than a stale notice
	// carried over from an earlier navigation.
	const error = createError ?? notice;

	return (
		<main className="mx-auto w-full max-w-4xl px-8 py-10">
			<header className="mb-6">
				<h1 className="font-semibold text-2xl">
					{t("nav.spaces")} · <span className="font-mono text-base">{spaceId}</span>
				</h1>
			</header>
			<div className="flex items-center gap-2 text-base-content/60 text-sm">
				<span>{t("pages.space_view.empty", "No page open yet.")}</span>
				<button
					className="btn btn-ghost btn-xs"
					disabled={creating || !spaceId}
					onClick={() => void handleCreatePage()}
					type="button"
				>
					{creating ? t("panels.pages.creating", "Creating…") : t("palette.commands.new_page")}
				</button>
			</div>
			{error ? <p className="mt-2 text-error text-xs">{error}</p> : null}
		</main>
	);
}
