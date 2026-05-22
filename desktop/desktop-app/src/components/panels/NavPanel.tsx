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
 */
import { DenseRow } from "@soma/ui/components/lists/dense-row";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router";

type NavEntry = {
	id: string;
	label: string;
	path: string;
};

export function NavPanel() {
	const { t } = useTranslation();
	const navigate = useNavigate();
	const { spaceId } = useParams<{ spaceId?: string }>();

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
				id: "members",
				label: t("panels.nav.members", "Members"),
				path: `/spaces/${spaceId}/members`,
			},
			{
				id: "meta_info",
				label: t("panels.nav.meta_info", "Meta info"),
				path: `/spaces/${spaceId}/info`,
			},
		];
	}, [spaceId, t]);

	return (
		<ul className="list list-dense">
			{entries.map((entry) => (
				<DenseRow aria-label={entry.label} key={entry.id} onClick={() => navigate(entry.path)} primary={entry.label} />
			))}
		</ul>
	);
}
