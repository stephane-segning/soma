import { useSpacesQuery } from "@soma/queries/spaces";
import { useMemo } from "react";
import { Navigate } from "react-router";

function Component(): React.JSX.Element {
	const spacesQuery = useSpacesQuery();
	const spaceId = useMemo(() => {
		const all = spacesQuery.data?.spaces ?? [];
		return all?.[0]?.spaceId;
	}, [spacesQuery.data?.spaces]);

	if (!spaceId) {
		return <div />;
	}

	return <Navigate to={`/spaces/${spaceId}`} />;
}

export { Component };
