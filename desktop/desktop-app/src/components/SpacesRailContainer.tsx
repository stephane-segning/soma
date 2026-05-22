/**
 * SpacesRailContainer — left-column wrapper around `@soma/ui`'s
 * `SpacesRail`. For Phase 1 this renders a hard-coded mock list so the
 * shell layout is verifiable end-to-end.
 *
 * TODO(phase-2): replace the mock list with `backend.spaces.list(...)`
 * via the SDK once the wire-up lands.
 */
import { type SpaceRailItem, SpacesRail } from "@soma/ui/components/nav/spaces-rail";
import { useNavigate, useParams } from "react-router";

const MOCK_SPACES: SpaceRailItem[] = [
	{ id: "demo-personal", icon: "PE", name: "Personal" },
	{ id: "demo-team", icon: "TE", name: "Team" },
	{ id: "demo-archive", icon: "AR", name: "Archive" },
];

export function SpacesRailContainer() {
	const navigate = useNavigate();
	const { spaceId } = useParams<{ spaceId?: string }>();

	return <SpacesRail activeId={spaceId ?? null} items={MOCK_SPACES} onSelect={(id) => navigate(`/spaces/${id}`)} />;
}
