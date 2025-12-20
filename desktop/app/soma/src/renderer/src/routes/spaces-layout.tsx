import { Outlet, Link } from "react-router";
import { useTranslation } from "react-i18next";

function Component(): React.JSX.Element {
	const { t } = useTranslation("common");

	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between">
				<Link className="btn btn-ghost btn-sm" to="/spaces/landing">
					{t("spaces.title", "Spaces")}
				</Link>
				<div className="join">
					<Link className="btn btn-ghost btn-sm" to="/spaces">
						{t("routes.spaces", "Spaces")}
					</Link>
					<Link className="btn btn-primary btn-sm" to="/spaces/join">
						{t("spaces.joinCta", "Join")}
					</Link>
				</div>
			</div>
			<Outlet />
		</div>
	);
}

export { Component };
