/**
 * NavPanel — space-scoped static nav entries hosted inside the left
 * inner rail's "Nav" panel slot. Collapses to global routes when no
 * space is selected.
 *
 * Previous revisions used `TreePopover` to share visual vocab with
 * `PagesPanel`, but that primitive is designed for a transient popover
 * (it ships a search field + Recent/Starred groups + `↑↓ / Enter / Esc`
 * keyboard-hint footer). None of that chrome makes sense for 1–3 static
 * rows pinned permanently in a rail slot, and the popover footer was
 * visibly leaking into the rail. We now render a plain `DenseRow` list
 * — the same primitive every other rail list uses (members, bots,
 * attachments) — so the slot reads as a list, not a stuck-open popover.
 *
 * NOT `useParams()` for the active space. `NavPanel` renders inside
 * `LeftInnerRail`, which `AppLayout` passes as its `leftColumn` prop —
 * a *sibling* of `<Outlet />`, not a descendant, so route params from
 * the nested `spaces/:spaceId` route are never visible here (same bug
 * `chat-panel.tsx` had before its fix — see that file's doc comment).
 * Every space-scoped entry below would silently disappear without this.
 */
import { DenseRow } from "@soma/ui/components/lists/dense-row";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router";
import { parseActiveSpaceId } from "../../lib/active-space";

type NavEntry = {
	id: string;
	label: string;
	path: string;
};

export function NavPanel() {
	const { t } = useTranslation();
	const navigate = useNavigate();
	const { pathname } = useLocation();
	const spaceId = parseActiveSpaceId(pathname);

	const entries = useMemo<NavEntry[]>(() => {
		const settings: NavEntry = {
			id: "settings",
			label: t("panels.nav.settings", "Settings"),
			path: "/settings",
		};
		if (!spaceId) return [settings];
		return [
			settings,
			{
				id: "practice",
				label: t("panels.nav.practice", "Practice"),
				path: `/spaces/${spaceId}/practice`,
			},
			{
				id: "space_settings",
				label: t("panels.nav.space_settings", "Space settings"),
				path: `/spaces/${spaceId}/settings`,
			},
		];
	}, [spaceId, t]);

	return (
		<ul className="list list-dense">
			{entries.map((entry) => (
				<DenseRow key={entry.id} onClick={() => navigate(entry.path)} primary={entry.label} />
			))}
		</ul>
	);
}
