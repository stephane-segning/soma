import { api } from "@app/store/api";
import { useMemo } from "react";

type UseSpaceAccessResult = {
	isChecking: boolean;
	hasAccess: boolean;
	error: unknown;
};

/** Access check backed by daemon GetSpace. */
export function useSpaceAccess(spaceId?: string): UseSpaceAccessResult {
	const enabled = useMemo(
		() => Boolean(spaceId && spaceId.trim().length > 0),
		[spaceId],
	);
	const { data, isLoading, isFetching, error } = api.useGetSpaceQuery(
		spaceId ?? "",
		{ skip: !enabled },
	);

	return useMemo(
		() => ({
			isChecking: isLoading || isFetching,
			hasAccess: Boolean(data),
			error: error ?? null,
		}),
		[isLoading, isFetching, data, error],
	);
}
