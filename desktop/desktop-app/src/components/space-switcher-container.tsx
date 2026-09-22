/**
 * SpaceSwitcherContainer — wraps `@soma/ui`'s `SpaceSwitcher` with the
 * real space list + navigation, for the "verySmall"-tier header (the
 * spaces rail is hidden at that tier — see `DesktopShell`'s
 * `leftGutter` doc comment, and `spaces-rail-container.tsx`, whose
 * `useSpacesList()` / `useCreateSpace()` hooks this component shares).
 *
 * "Join a space" mirrors `SpacesIndex`'s own CTA: navigate to `/join`
 * empty and let the user paste their invite link there.
 */
import { SpaceSwitcher } from "@soma/ui/components/nav/space-switcher";
import { useLocation, useNavigate } from "react-router";
import { parseActiveSpaceId } from "../lib/active-space";
import { useCreateSpace } from "../lib/use-create-space";
import { useSpacesList } from "../lib/use-spaces-list";

export function SpaceSwitcherContainer() {
	const navigate = useNavigate();
	const { pathname } = useLocation();
	const spaceId = parseActiveSpaceId(pathname) ?? undefined;
	const items = useSpacesList();
	const { create } = useCreateSpace();

	return (
		<SpaceSwitcher
			activeId={spaceId ?? null}
			items={items}
			onCreate={create}
			onJoin={() => navigate("/join")}
			onSelect={(id) => navigate(`/spaces/${id}`)}
		/>
	);
}
