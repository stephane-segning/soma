import { NavLink, Outlet } from "react-router";
import { useTranslation } from "react-i18next";

function Component(): React.JSX.Element {
	const { t } = useTranslation("common");

	return (
		<div className="flex min-h-dvh w-full bg-base-100">
			<aside className="w-56 border-r border-base-300 bg-base-200/40">
				<div className="sticky top-0 border-b border-base-300 bg-base-200/60 px-4 py-4">
					<div className="text-sm font-semibold">{t("settings.title", "Settings")}</div>
				</div>
				<nav className="menu px-2 py-3">
					<li>
						<NavLink to="/spaces">{t("routes.spaces", "Spaces")}</NavLink>
					</li>
					<li>
						<NavLink to="/settings">{t("settings.identity", "Identity")}</NavLink>
					</li>
					<li>
						<NavLink to="/settings">{t("settings.connectivity", "Connectivity")}</NavLink>
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
