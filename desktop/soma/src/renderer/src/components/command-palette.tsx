/**
 * CommandPaletteShell — Cutover 4 of the UI revamp.
 *
 * Replaces the `react-cmdk` wrapper with `@soma/ui`'s revamped
 * `CommandPalette` per [ADR-0005 §12](../../../../../../docs/src/architecture/adrs/0005-ui-revamp-v0.md).
 * The new palette owns its own ⌘K hotkey + ESC + arrow navigation;
 * we just feed it `items` and wire `open` to the existing
 * `isCommandPaletteOpen` redux slice.
 *
 * Sections in fixed priority order: Recent docs · Spaces · Documents
 * · Commands. Search results map to Documents. Recent is populated
 * by the recentPages redux slice.
 */
import { useSearchQuery } from "@app/queries/search";
import { useSpacesQuery } from "@app/queries/spaces";
import { useAppDispatch, useAppSelector } from "@app/store/hooks";
import { selectRecentPages } from "@app/store/recent-pages";
import { uiActions, uiSelectors } from "@app/store/ui";
import {
	CommandPalette,
	type CommandPaletteItem,
} from "@soma/ui/components/overlays/command-palette";
import { useMemo, useState } from "react";
import { Compass, FileText, Globe, Settings as SettingsIcon } from "react-feather";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";

function CommandPaletteShell(): React.JSX.Element {
	const { t } = useTranslation("common");
	const dispatch = useAppDispatch();
	const isOpen = useAppSelector(uiSelectors.selectIsCommandPaletteOpen);
	const recentPages = useAppSelector(selectRecentPages);
	const navigate = useNavigate();
	const [query, setQuery] = useState("");
	const spacesQuery = useSpacesQuery();
	const searchResults = useSearchQuery(query);

	const close = () => dispatch(uiActions.toggleCommandPalette(false));
	const open = () => dispatch(uiActions.toggleCommandPalette(true));

	const items = useMemo<CommandPaletteItem[]>(() => {
		const recentItems: CommandPaletteItem[] = recentPages.map((entry) => ({
			id: `recent:${entry.spaceId}:${entry.pageId}`,
			title: entry.title,
			subtitle: entry.spaceId,
			section: "recent-docs" as const,
			icon: <FileText className="size-3.5" />,
			onSelect: () => navigate(`/spaces/${entry.spaceId}/pages/${entry.pageId}`),
		}));

		const spaceItems: CommandPaletteItem[] = (spacesQuery.data?.spaces ?? []).map(
			(space) => ({
				id: `space:${space.spaceId}`,
				title: space.displayName?.trim() || space.spaceId,
				section: "spaces" as const,
				icon: <Compass className="size-3.5" />,
				onSelect: () => navigate(`/spaces/${space.spaceId}/pages`),
			}),
		);

		const documentItems: CommandPaletteItem[] = (searchResults.data ?? []).map(
			(result) => ({
				id: `doc:${result.id}`,
				title: result.title,
				subtitle: result.subtitle,
				section: "documents" as const,
				icon: <FileText className="size-3.5" />,
				onSelect: () => {
					// Search results are opaque ids — the palette just closes
					// when picked. Page-link resolution is a follow-up once
					// the search service exposes navigation targets.
				},
			}),
		);

		const commandItems: CommandPaletteItem[] = [
			{
				id: "cmd:spaces-landing",
				title: t("command-palette.spaces-landing", "Create or join space"),
				section: "commands",
				icon: <Compass className="size-3.5" />,
				onSelect: () => navigate("/spaces/landing"),
			},
			{
				id: "cmd:settings",
				title: t("command-palette.settings", "Settings"),
				section: "commands",
				icon: <SettingsIcon className="size-3.5" />,
				onSelect: () => navigate("/settings"),
			},
			{
				id: "cmd:project-site",
				title: t("command-palette.project-site", "Project site"),
				subtitle: "soma.camer.digital",
				section: "commands",
				icon: <Globe className="size-3.5" />,
				onSelect: () => {
					window.open(
						"https://soma.camer.digital",
						"_blank",
						"noopener,noreferrer",
					);
				},
			},
		];

		return [...recentItems, ...spaceItems, ...documentItems, ...commandItems];
	}, [navigate, recentPages, searchResults.data, spacesQuery.data, t]);

	return (
		<CommandPalette
			items={items}
			onClose={close}
			onOpen={open}
			onQueryChange={setQuery}
			open={isOpen}
			placeholder={t(
				"command-palette.placeholder",
				"Search docs, spaces, commands…",
			)}
		/>
	);
}

export { CommandPaletteShell };
