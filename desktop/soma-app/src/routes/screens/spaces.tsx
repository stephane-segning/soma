import { useCreateSpaceMutation, useSpacesQuery } from "@soma/queries/spaces";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

function Component(): React.JSX.Element {
	const { t } = useTranslation("common");
	const spacesQuery = useSpacesQuery();
	const createSpace = useCreateSpaceMutation();
	const spaces = spacesQuery.data?.spaces ?? [];

	return (
		<div className="space-y-8">
			<div className="space-y-2">
				<h1 className="font-semibold text-4xl">
					{t("spaces.title", "Spaces")}
				</h1>
				<div className="flex items-center gap-3">
					<div className="join w-full max-w-xl">
						<span className="btn btn-ghost join-item text-base-content/60">
							{t("spaces.filterLabel", "Filter")}
						</span>
						<input
							className="input input-bordered join-item w-full"
							placeholder={t("spaces.filterPlaceholder", "Filter spaces...")}
						/>
					</div>
					<button
						className="btn btn-primary btn-sm"
						disabled={createSpace.isPending}
						onClick={async () => {
							try {
								const created = await createSpace.mutateAsync({});
								if (created?.spaceId) {
									window.location.hash = `#/spaces/${created.spaceId}/pages`;
								}
							} catch {
								// ignore errors for now
							}
						}}
						type="button"
					>
						{t("spaces.createCta", "Create new space")}
					</button>
				</div>
			</div>

			<div className="space-y-3">
				{spacesQuery.isLoading && (
					<>
						<div className="card border border-base-300 bg-base-100 shadow-sm">
							<div className="card-body">
								<div className="skeleton h-12 w-full" />
							</div>
						</div>
						<div className="card border border-base-300 bg-base-100 shadow-sm">
							<div className="card-body">
								<div className="skeleton h-12 w-5/6" />
							</div>
						</div>
					</>
				)}

				{!spacesQuery.isLoading && spaces.length === 0 && (
					<div className="border border-base-300 border-dashed p-6 text-base-content/70">
						{t(
							"spaces.empty",
							"No spaces yet. Create one or join with an invite.",
						)}
					</div>
				)}

				{spaces.map((space) => (
					<Link
						className="card border border-base-300 bg-base-100 shadow-sm transition hover:border-primary/40"
						key={space.spaceId}
						to={`/spaces/${space.spaceId}/pages`}
					>
						<div className="card-body">
							<div className="flex items-center justify-between">
								<div className="flex items-center gap-4">
									<div className="avatar placeholder">
										<div className="w-12 bg-base-200 text-base-content">
											<span>
												{(space.displayName || space.spaceId)
													.slice(0, 2)
													.toUpperCase()}
											</span>
										</div>
									</div>
									<div>
										<div className="font-semibold">
											{space.displayName || space.spaceId}
										</div>
										<div className="text-base-content/60 text-sm">
											{space.ownerPeerId
												? t("spaces.ownerLabel", {
														defaultValue: "Owner: {{owner}}",
														owner: space.ownerPeerId,
													})
												: t("spaces.ownerUnknown", "Owner unknown")}
										</div>
									</div>
								</div>
								<span className="text-base-content/50">›</span>
							</div>
						</div>
					</Link>
				))}
			</div>

			<div className="card border border-base-300 bg-base-100">
				<div className="card-body space-y-4">
					<h2 className="font-semibold text-base-content/70 text-sm">
						{t("spaces.joinTitle", "Join a space")}
					</h2>
					<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
						<label className="form-control w-full">
							<span className="label-text">
								{t("join.spaceId", "Space ID")}
							</span>
							<input
								className="input input-bordered w-full"
								placeholder={t("join.spaceIdPlaceholder", "space_...")}
							/>
						</label>
						<label className="form-control w-full">
							<span className="label-text">
								{t("join.inviteSecret", "Invite secret")}
							</span>
							<input
								className="input input-bordered w-full"
								placeholder={t("join.inviteSecretPlaceholder", "secret_...")}
							/>
						</label>
					</div>
					<div className="card-actions justify-end">
						<Link className="btn btn-ghost btn-sm" to="/spaces/join">
							{t("spaces.joinMore", "Add display name")}
						</Link>
						<button className="btn btn-primary btn-sm" type="button">
							{t("join.submit", "Request to join")}
						</button>
					</div>
				</div>
			</div>
		</div>
	);
}

export { Component };
