import { useCreateSpaceMutation, useSpacesQuery } from "@app/queries/spaces";
import { ArrowRight, Plus, Settings } from "react-feather";
import { Link, useNavigate } from "react-router";

function Component(): React.JSX.Element {
	const navigate = useNavigate();
	const spacesQuery = useSpacesQuery();
	const { mutateAsync: createSpace, isLoading: isCreating } = useCreateSpaceMutation();
	const spaces = spacesQuery.data?.spaces ?? [];

	const handleCreateSpace = async () => {
		const created = await createSpace({});
		navigate(`/spaces/${created.spaceId}/pages`);
	};

	return (
		<div className="space-y-8">
			<div className="space-y-3">
				<p className="font-medium text-primary text-xs uppercase tracking-[0.18em]">Structured notes</p>
				<h1 className="max-w-2xl font-semibold text-3xl text-base-content leading-tight md:text-4xl">
					Soma keeps spaces focused on pages, notes, and private collaboration.
				</h1>
				<p className="max-w-2xl text-base-content/70 text-sm md:text-base">
					Start with a space, then create pages with notes and attachments. If someone already invited you, Soma can
					request access with the connection details they shared.
				</p>
			</div>

			<div className="grid gap-4 md:grid-cols-[1.4fr_1fr]">
				<div className="rounded-2xl border border-base-300 bg-base-100 p-6 shadow-sm">
					<div className="flex items-start justify-between gap-4">
						<div className="space-y-2">
							<h2 className="font-semibold text-xl">Create your first space</h2>
							<p className="max-w-xl text-base-content/70 text-sm">
								A space is your private workspace boundary for pages, attachments, memberships, and bot access.
							</p>
						</div>
						<div className="rounded-2xl bg-success/10 p-3 text-success">
							<Plus className="size-5" />
						</div>
					</div>

					<div className="mt-6 flex flex-wrap items-center gap-3">
						<button
							className="btn btn-primary"
							disabled={isCreating}
							onClick={() => void handleCreateSpace()}
							type="button"
						>
							{isCreating ? "Creating..." : "Create a space"}
						</button>
						<Link className="btn btn-ghost" to="/settings">
							Open settings
						</Link>
					</div>
				</div>

				<div className="rounded-2xl border border-base-300 bg-base-100 p-6 shadow-sm">
					<div className="space-y-3">
						<h2 className="font-semibold text-lg">Join a space</h2>
						<p className="text-base-content/70 text-sm">
							If someone already invited you, request access with the space ID and connection details they sent.
						</p>
						<Link className="btn btn-outline btn-sm" to="/spaces/join">
							Request access
						</Link>
					</div>
				</div>
			</div>

			<div className="rounded-2xl border border-base-300 border-dashed bg-base-100/70 p-5">
				<div className="flex items-center justify-between gap-4">
					<div>
						<h2 className="font-semibold text-base">Existing spaces</h2>
						<p className="text-base-content/70 text-sm">
							Open an existing space or start fresh if this device has not joined one yet.
						</p>
					</div>
					<Link className="btn btn-ghost btn-sm" to="/settings">
						<Settings className="size-4" />
						<span>Memberships</span>
					</Link>
				</div>

				<div className="mt-4 space-y-2">
					{spacesQuery.isLoading ? <div className="text-base-content/60 text-sm">Loading spaces...</div> : null}
					{!spacesQuery.isLoading && spaces.length === 0 ? (
						<div className="rounded-xl border border-base-300 border-dashed px-4 py-3 text-base-content/60 text-sm">
							This device has not joined a space yet. Create one now or open the join screen if someone invited you.
						</div>
					) : null}
					{spaces.map((space) => (
						<Link
							className="flex items-center justify-between rounded-xl border border-base-300 px-4 py-3 transition-colors hover:bg-base-200/60"
							key={space.spaceId}
							to={`/spaces/${space.spaceId}/pages`}
						>
							<div>
								<div className="font-medium">{space.displayName || space.spaceId}</div>
								<div className="text-base-content/60 text-xs">{space.spaceId}</div>
							</div>
							<ArrowRight className="size-4 text-base-content/50" />
						</Link>
					))}
				</div>
			</div>
		</div>
	);
}

export { Component };
