import { Link, Outlet, NavLink, useParams } from "react-router";
import { useTranslation } from "react-i18next";

function Component(): React.JSX.Element {
	const { t } = useTranslation("common");
	const { spaceId } = useParams();

	return (
		<div className="flex min-h-[70dvh] w-full overflow-hidden rounded-box border border-base-300 bg-base-100">
			<aside className="w-56 border-r border-base-300 bg-base-200/40">
				<div className="sticky top-0 border-b border-base-300 bg-base-200/60 backdrop-blur">
					<div className="px-3 py-3">
						<Link className="btn btn-ghost btn-sm w-full justify-start" to="/spaces">
							{t("routes.spaces", "Spaces")}
						</Link>
						<div className="mt-2 text-xs text-base-content/60">
							{spaceId ?? t("space.unknown", "Unknown space")}
						</div>
					</div>
				</div>

				<nav className="menu px-2 py-2">
					<li>
						<NavLink to={`/spaces/${spaceId}/pages`}>
							{t("space.tabs.pages", "Pages")}
						</NavLink>
					</li>
					<li>
						<NavLink to={`/spaces/${spaceId}/members`}>
							{t("space.tabs.members", "Members")}
						</NavLink>
					</li>
				</nav>

				<div className="sticky bottom-0 mt-auto border-t border-base-300 bg-base-200/60 backdrop-blur">
					<nav className="menu px-2 py-2">
						<li>
							<NavLink to={`/spaces/${spaceId}/settings`}>
								{t("space.tabs.settings", "Settings")}
							</NavLink>
						</li>
					</nav>
				</div>
			</aside>

			<section className="flex-1 p-5">
				<Outlet />
			</section>
		</div>
	);
}

export { Component };
