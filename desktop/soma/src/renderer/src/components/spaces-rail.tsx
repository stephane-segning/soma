/**
 * SpacesRail — renderer-side wrapper around `@soma/ui`'s
 * `SpacesRail`. Wave-2 cutover replaces the old 64px avatar column with
 * the locked 52px icon rail from [ADR-0005 §2](../../../../../../docs/src/architecture/adrs/0005-ui-revamp-v0.md).
 *
 * Maps `useSpacesQuery` rows onto `SpaceRailItem` (2-letter monogram
 * icon, displayName as tooltip) and wires navigation through React
 * Router. The trailing `+` button routes to the spaces landing screen
 * — joining vs. creating happens there.
 */
import { useSpacesQuery } from "@app/queries/spaces";
import { SpacesRail as SomaSpacesRail } from "@soma/ui/components/nav/spaces-rail";
import { useMemo } from "react";
import { useNavigate, useParams } from "react-router";

function SpacesRail(): React.JSX.Element {
	const spacesQuery = useSpacesQuery();
	const { spaceId: activeId } = useParams<{ spaceId: string }>();
	const navigate = useNavigate();

	const items = useMemo(
		() =>
			(spacesQuery.data?.spaces ?? []).map((space) => ({
				id: space.spaceId,
				icon: (
					<span className="font-semibold text-xs leading-none">
						{monogram(space.displayName, space.spaceId)}
					</span>
				),
				name: space.displayName?.trim() || space.spaceId,
			})),
		[spacesQuery.data],
	);

	if (spacesQuery.isLoading && items.length === 0) {
		return (
			<nav
				aria-busy
				aria-label="Spaces"
				className="flex h-full w-[52px] shrink-0 flex-col items-center gap-1 border-base-300 border-r bg-base-100 py-2"
			>
				<div className="skeleton size-9 rounded-md" />
				<div className="skeleton size-9 rounded-md" />
			</nav>
		);
	}

	return (
		<SomaSpacesRail
			activeId={activeId}
			items={items}
			onCreate={() => navigate("/spaces/landing")}
			onSelect={(id) => navigate(`/spaces/${id}/pages`)}
		/>
	);
}

function monogram(displayName: string | undefined, fallback: string): string {
	const source = displayName?.trim() || fallback;
	const words = source.split(/\s+/).filter(Boolean);
	if (words.length >= 2) {
		return (words[0][0] + words[1][0]).toUpperCase();
	}
	return source.slice(0, 2).toUpperCase();
}

export { SpacesRail };
