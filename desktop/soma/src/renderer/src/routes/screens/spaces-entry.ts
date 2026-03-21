import type { Space } from "@app/services/spaces-service.ts";

function resolveSpacesEntryPath(spaces: Pick<Space, "spaceId">[]): string {
	const firstSpaceId = spaces.find((space) => space.spaceId.trim().length > 0)?.spaceId.trim();
	return firstSpaceId ? `/spaces/${firstSpaceId}/pages` : "/spaces/landing";
}

export { resolveSpacesEntryPath };
