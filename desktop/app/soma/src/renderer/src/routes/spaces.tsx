import { Link } from "react-router";
import { useTranslation } from "react-i18next";

function Component(): React.JSX.Element {
	const { t } = useTranslation("common");

	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between">
				<h1 className="text-2xl font-semibold">{t("spaces.title", "Spaces")}</h1>
				<Link className="btn btn-ghost btn-sm" to="/spaces/join">
					{t("spaces.joinCta", "Join")}
				</Link>
			</div>

			<div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.2fr_0.8fr]">
				<div className="card bg-base-100 border border-base-300">
					<div className="card-body">
						<h2 className="text-sm font-semibold text-base-content/70">
							{t("spaces.listTitle", "Your spaces")}
						</h2>
						<div className="space-y-2">
							<Link className="btn btn-ghost justify-start" to="/spaces/private/pages/welcome">
								<span className="badge badge-ghost badge-sm">
									{t("spaces.privateBadge", "Private")}
								</span>
								<span className="ml-2">{t("spaces.privateTitle", "Private space")}</span>
							</Link>
							<div className="skeleton h-10 w-full" />
							<div className="skeleton h-10 w-5/6" />
						</div>
					</div>
				</div>

				<div className="card bg-base-100 border border-base-300">
					<div className="card-body space-y-4">
						<h2 className="text-sm font-semibold text-base-content/70">
							{t("spaces.joinTitle", "Join a space")}
						</h2>
						<label className="form-control w-full">
							<span className="label-text">{t("join.spaceId", "Space ID")}</span>
							<input
								className="input input-bordered w-full"
								placeholder={t("join.spaceIdPlaceholder", "space_...")}
							/>
						</label>
						<label className="form-control w-full">
							<span className="label-text">{t("join.inviteSecret", "Invite secret")}</span>
							<input
								className="input input-bordered w-full"
								placeholder={t("join.inviteSecretPlaceholder", "secret_...")}
							/>
						</label>
						<div className="card-actions justify-end">
							<button type="button" className="btn btn-primary btn-sm">
								{t("join.submit", "Request to join")}
							</button>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}

export { Component };
