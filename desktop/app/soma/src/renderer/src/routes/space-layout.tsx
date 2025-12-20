import { Link, Outlet, useParams } from "react-router";
import { useTranslation } from "react-i18next";

function Component(): React.JSX.Element {
	const { t } = useTranslation("common");
	const { spaceId } = useParams();

	return (
		<div className="space-y-6">
			<div className="breadcrumbs text-sm">
				<ul>
					<li>
						<Link to="/spaces">{t("routes.spaces", "Spaces")}</Link>
					</li>
					<li>{spaceId ?? t("space.unknown", "Unknown space")}</li>
				</ul>
			</div>

			<div className="tabs tabs-bordered">
				<Link className="tab" to={`/spaces/${spaceId}/pages`}>
					{t("space.tabs.pages", "Pages")}
				</Link>
				<Link className="tab" to={`/spaces/${spaceId}/members`}>
					{t("space.tabs.members", "Members")}
				</Link>
				<Link className="tab" to={`/spaces/${spaceId}/settings`}>
					{t("space.tabs.settings", "Settings")}
				</Link>
			</div>

			<div className="card bg-base-100 border border-base-300">
				<div className="card-body">
					<Outlet />
				</div>
			</div>
		</div>
	);
}

export { Component };

