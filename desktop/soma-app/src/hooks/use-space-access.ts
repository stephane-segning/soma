import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import * as spacesService from "../services/spaces-service";

type UseSpaceAccessResult = {
	isChecking: boolean;
	hasAccess: boolean;
	error: unknown;
};

/**
 * Access check backed by daemon GetSpace. Uses TanStack Query for caching and status.
 */
export function useSpaceAccess(spaceId?: string): UseSpaceAccessResult {
	const enabled = useMemo(
		() => Boolean(spaceId && spaceId.trim().length > 0),
		[spaceId],
	);
	const { data, isPending, isFetching, error } = useQuery({
		queryKey: ["space-access", spaceId],
		enabled,
		retry: 1,
		queryFn: () => {
			if (!spaceId) throw new Error("spaceId required");
			return spacesService.getSpace(spaceId);
		},
	});

	return useMemo(
		() => ({
			isChecking: isPending || isFetching,
			hasAccess: Boolean(data),
			error: error ?? null,
		}),
		[isPending, isFetching, data, error],
	);
}
