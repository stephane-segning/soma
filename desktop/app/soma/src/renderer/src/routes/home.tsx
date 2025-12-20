import { Link } from "react-router";
import { useTranslation } from "react-i18next";

function Component(): React.JSX.Element {
	const { t } = useTranslation("common");

	return (
		<div className="space-y-6">
			<div className="card bg-base-100 shadow-sm border border-base-300">
				<div className="card-body">
					<h1 className="card-title">{t("home.title", "Home")}</h1>
					<p className="text-base-content/70">
						{t(
							"home.subtitle",
							"Join a space with an invite, or open an existing space from your list.",
						)}
					</p>
					<div className="card-actions justify-end">
						<Link className="btn btn-primary" to="/join">
							{t("home.joinCta", "Join space")}
						</Link>
						<Link className="btn btn-ghost" to="/spaces">
							{t("home.spacesCta", "View spaces")}
						</Link>
					</div>
				</div>
			</div>

			<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
				<div className="card bg-base-100 border border-base-300">
					<div className="card-body">
						<h2 className="card-title text-base">
							{t("home.recentSpaces", "Recent spaces")}
						</h2>
						<div className="space-y-2">
							<div className="skeleton h-6 w-full" />
							<div className="skeleton h-6 w-5/6" />
							<div className="skeleton h-6 w-2/3" />
						</div>
					</div>
				</div>
				<div className="card bg-base-100 border border-base-300">
					<div className="card-body">
						<h2 className="card-title text-base">
							{t("home.activity", "Activity")}
						</h2>
						<div className="space-y-2">
							<div className="skeleton h-4 w-full" />
							<div className="skeleton h-4 w-11/12" />
							<div className="skeleton h-4 w-2/3" />
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}

export { Component };

