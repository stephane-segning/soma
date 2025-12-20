import { Link } from "react-router";
import { useTranslation } from "react-i18next";

function Component(): React.JSX.Element {
	const { t } = useTranslation("common");

	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between">
				<h1 className="text-2xl font-semibold">{t("spaces.title", "Spaces")}</h1>
				<Link className="btn btn-primary btn-sm" to="/join">
					{t("spaces.joinCta", "Join")}
				</Link>
			</div>

			<div className="card bg-base-100 border border-base-300">
				<div className="card-body">
					<div className="space-y-3">
						<div className="skeleton h-12 w-full" />
						<div className="skeleton h-12 w-full" />
						<div className="skeleton h-12 w-full" />
					</div>

					<div className="divider" />

					<div className="flex items-center justify-between">
						<span className="text-sm text-base-content/60">
							{t("spaces.emptyHint", "No spaces loaded yet.")}
						</span>
						<Link className="btn btn-ghost btn-sm" to="/spaces/demo-space">
							{t("spaces.openDemo", "Open demo space")}
						</Link>
					</div>
				</div>
			</div>
		</div>
	);
}

export { Component };

