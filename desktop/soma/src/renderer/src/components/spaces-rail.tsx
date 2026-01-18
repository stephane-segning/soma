import { cn } from "@app/lib/cn.ts";
import { useSpacesQuery } from "@app/queries/spaces";
import Avatar from "react-avatar";
import { Plus } from "react-feather";
import { Link, useParams } from "react-router";

function SpacesRail(): React.JSX.Element {
	const spacesQuery = useSpacesQuery();
	const { spaceId } = useParams<{ spaceId: string }>();
	const spaces = spacesQuery.data?.spaces ?? [];

	return (
		<div className="flex h-full w-16 flex-col items-center gap-3 overflow-y-auto px-2 py-3">
			{spacesQuery.isLoading && (
				<>
					<div className="avatar">
						<div className="skeleton size-12 rounded-2xl bg-base-300 outline outline-2 outline-base-100" />
					</div>
					<div className="avatar">
						<div className="skeleton size-12 rounded-2xl bg-base-300 outline outline-2 outline-base-100" />
					</div>
				</>
			)}

			{spaces.map((space) => {
				const isActive = space.spaceId === spaceId;

				return (
					<Link
						className="avatar"
						key={space.spaceId}
						to={`/spaces/${space.spaceId}/pages`}
					>
						<div
							className={cn(
								"flex w-12 items-center justify-center rounded-2xl ring-2 ring-dashed ring-offset-2 ring-offset-base-100",
								isActive && "ring-primary",
								!isActive && "ring-transparent hover:ring-base-300",
							)}
						>
							<Avatar name={space.displayName || space.spaceId} />
						</div>
					</Link>
				);
			})}

			{/* TODO implement a logic using `useCreateSpaceMutation` to create a new space or redirect to `/spaces/join` to join a new space*/}
			<Link className="avatar" to="/spaces">
				<div className="flex w-12 items-center justify-center rounded-2xl bg-base-100 outline-dotted outline-2 outline-base-300">
					<Plus className="size-4" />
				</div>
			</Link>
		</div>
	);
}

export { SpacesRail };
