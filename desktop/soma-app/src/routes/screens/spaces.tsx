import { useTranslation } from "react-i18next";
import { Link } from "react-router";

function Component(): React.JSX.Element {
	const { t } = useTranslation("common");

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
					<button className="btn btn-primary btn-sm" type="button">
						{t("spaces.createCta", "Create new space")}
					</button>
				</div>
			</div>

			<div className="space-y-3">
				<Link
					className="card border border-base-300 bg-base-100 shadow-sm transition hover:border-primary/40"
					to="/spaces/private/pages/welcome"
				>
					<div className="card-body">
						<div className="flex items-center justify-between">
							<div className="flex items-center gap-4">
								<div className="avatar placeholder">
									<div className="w-12 rounded-full bg-base-200 text-base-content">
										<span>PS</span>
									</div>
								</div>
								<div>
									<div className="font-semibold">
										{t("spaces.privateTitle", "Private space")}
									</div>
									<div className="text-base-content/60 text-sm">
										{t("spaces.privateMeta", "1 member, 12 pages")}
									</div>
								</div>
							</div>
							<span className="text-base-content/50">›</span>
						</div>
					</div>
				</Link>

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
