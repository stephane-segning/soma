import { useEffect, useMemo, useState } from "react";
import { useSpacesQuery } from "@soma/queries/spaces";
import { Link } from "react-router";

function currentSpaceId(hash: string): string | null {
	const normalized = hash.startsWith("#") ? hash.slice(1) : hash;
	const match = normalized.match(/\/spaces\/([^/]+)/);
	return match ? match[1] : null;
}

function useActiveSpaceId() {
	const [hash, setHash] = useState(() => window.location.hash);

	useEffect(() => {
		const handler = () => setHash(window.location.hash);
		window.addEventListener("hashchange", handler);
		return () => window.removeEventListener("hashchange", handler);
	}, []);

	return useMemo(() => currentSpaceId(hash), [hash]);
}

function SpacesRail(): React.JSX.Element {
	const spacesQuery = useSpacesQuery();
	const activeSpaceId = useActiveSpaceId();
	const spaces = spacesQuery.data?.spaces ?? [];

	return (
		<div className="flex h-full flex-col items-center gap-3 overflow-y-auto px-2 py-3">
			{spacesQuery.isLoading && (
				<>
					<div className="size-12 rounded-2xl bg-base-300" />
					<div className="size-12 rounded-2xl bg-base-300" />
				</>
			)}
			{spaces.map((space) => {
				const isActive = space.spaceId === activeSpaceId;
				const initials =
					(space.displayName || space.spaceId || "?").slice(0, 2).toUpperCase();
				return (
					<Link
						className="group"
						key={space.spaceId}
						to={`/spaces/${space.spaceId}/pages`}
					>
						<div
							className={[
								"size-12 rounded-2xl ring-2 ring-offset-2 transition",
								isActive
									? "bg-primary/20 ring-primary"
									: "bg-base-200 ring-transparent hover:ring-base-300",
							].join(" ")}
						>
							<div className="flex h-full items-center justify-center text-sm font-semibold">
								{initials}
							</div>
						</div>
					</Link>
				);
			})}

			<Link
				className="flex size-12 items-center justify-center rounded-2xl bg-base-200 text-lg font-bold ring-2 ring-dashed ring-base-300 transition hover:bg-base-300"
				to="/spaces"
			>
				+
			</Link>
		</div>
	);
}

export { SpacesRail };
