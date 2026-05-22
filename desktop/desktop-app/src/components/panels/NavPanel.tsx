/**
 * NavPanel — static nav entries hosted inside the left inner rail's
 * "Nav" panel slot. Scoped to the current space when one is selected;
 * collapses to global routes otherwise.
 *
 * Uses the same `TreePopover` primitive as `PagesPanel` so the two
 * rail slots share visual + interaction vocabulary (search field,
 * keyboard hints, row style). The static items are rendered as
 * top-level `TreeDoc` rows with no parent.
 */
import { type TreeDoc, TreePopover } from "@soma/ui/components/nav/tree-popover";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router";

type NavEntry = {
	doc: TreeDoc;
	path: string;
};

export function NavPanel() {
	const { t } = useTranslation();
	const navigate = useNavigate();
	const { spaceId } = useParams<{ spaceId?: string }>();

	const entries = useMemo<NavEntry[]>(() => {
		const settings: NavEntry = {
			doc: { id: "settings", title: t("panels.nav.settings", "Settings") },
			path: "/settings",
		};
		if (!spaceId) return [settings];
		return [
			settings,
			{
				doc: { id: "members", title: t("panels.nav.members", "Members") },
				path: `/spaces/${spaceId}/members`,
			},
			{
				doc: { id: "meta_info", title: t("panels.nav.meta_info", "Meta info") },
				path: `/spaces/${spaceId}/info`,
			},
		];
	}, [spaceId, t]);

	const byId = useMemo(() => {
		const map = new Map<string, NavEntry>();
		for (const entry of entries) map.set(entry.doc.id, entry);
		return map;
	}, [entries]);

	return (
		<TreePopover
			documents={entries.map((entry) => entry.doc)}
			onClose={() => {
				// Persistent rail slot — `onClose` is a no-op. Selecting an
				// entry navigates; the panel stays mounted.
			}}
			onSelect={(id) => {
				const entry = byId.get(id);
				if (entry) navigate(entry.path);
			}}
		/>
	);
}
