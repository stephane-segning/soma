import { useTranslation } from "react-i18next";
import { NavLink, Outlet } from "react-router";

function Component(): React.JSX.Element {
	const { t } = useTranslation("common");

	return (
		<div className="flex h-content w-full bg-base-100">
			<aside className="w-56 border-base-300 border-r bg-base-200/40">
				<div className="sticky top-0 border-base-300 border-b bg-base-200/60 px-4 py-4">
					<div className="font-semibold text-sm">
						{t("settings.title", "Settings")}
					</div>
				</div>
				<nav className="menu px-2 py-3">
					<li>
						<NavLink to="/spaces">{t("routes.spaces", "Spaces")}</NavLink>
					</li>
					<li>
						<NavLink to="/settings">
							{t("settings.identity", "Identity")}
						</NavLink>
					</li>
					<li>
						<NavLink to="/settings">
							{t("settings.connectivity", "Connectivity")}
						</NavLink>
					</li>
				</nav>
			</aside>

			<section className="flex-1 p-6">
				<Outlet />
			</section>
		</div>
	);
}

export { Component };
