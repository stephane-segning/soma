/**
 * SpacesRailContainer — left-column wrapper around `@soma/ui`'s
 * `SpacesRail`. Data fetching (list + `join-decision` refresh) lives
 * in `useSpacesList()`, shared with `SpaceSwitcherContainer` (the
 * "verySmall"-tier header replacement for this rail — see
 * `DesktopShell`'s `leftGutter` doc comment for why that tier hides
 * this rail); this component is just the icon-rail presentation of
 * that same inventory.
 *
 * `onCreate` (the rail's trailing `+` button) shares `useCreateSpace()`
 * with the space switcher's "Create space" row — see that hook's doc
 * comment for the failure-path behavior. The same "New Space" command
 * reachable via ⌘⇧N / the native menu / the command palette
 * (`CommandPaletteRoot`) does the identical two steps but keeps its
 * own copy, since it dispatches from outside the router tree these
 * hooks run in.
 */
import { SpacesRail } from "@soma/ui/components/nav/spaces-rail";
import { useLocation, useNavigate } from "react-router";
import { parseActiveSpaceId } from "../lib/active-space";
import { useCreateSpace } from "../lib/use-create-space";
import { useSpacesList } from "../lib/use-spaces-list";

export function SpacesRailContainer() {
	const navigate = useNavigate();
	// NOT `useParams()`. This component renders inside a column
	// `AppLayout` passes to `DesktopShell` (a *sibling* of `<Outlet />`),
	// so route params from `spaces/:spaceId` never reach it and
	// `useParams()` resolves to `{}`. Derive the active space from the
	// live pathname instead — same fix as `chat-panel`, `nav-panel` and
	// `bots-panel`.
	const { pathname } = useLocation();
	const spaceId = parseActiveSpaceId(pathname) ?? undefined;
	const items = useSpacesList();
	const { create } = useCreateSpace();

	return (
		<SpacesRail
			activeId={spaceId ?? null}
			// Transparent gutter — the rail carries no fill of its own, so it
			// reveals the shell's unified canvas. Only the space tiles + the
			// hairline `border-r` divider remain visible. (`SpacesRail`
			// defaults to `bg-base-100`; twMerge lets this override win.)
			className="bg-transparent"
			items={items}
			onCreate={create}
			onSelect={(id) => navigate(`/spaces/${id}`)}
		/>
	);
}
