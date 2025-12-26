import { useTranslation } from "react-i18next";
import { NavLink, Outlet } from "react-router";

function Component(): React.JSX.Element {
	const { t } = useTranslation("common");

	return (
		<div className="flex h-content w-full overflow-hidden rounded-box border border-base-300 bg-base-200/60">
			<aside className="w-64 border-base-300 border-r bg-base-200">
				<div className="sticky top-0 border-base-300 border-b bg-base-200/80 px-4 py-4">
					<div className="flex items-center gap-3">
						<div className="avatar placeholder">
							<div className="w-10 rounded-full bg-base-300 text-base-content">
								<span>SD</span>
							</div>
						</div>
						<div className="text-sm">
							<div className="font-semibold">
								{t("spaces.profileName", "Sarah Doe")}
							</div>
							<div className="text-base-content/60">
								{t("spaces.profileEmail", "s.doe@example.com")}
							</div>
						</div>
					</div>
				</div>

				<nav className="menu px-2 py-3">
					<li>
						<NavLink to="/spaces/landing">
							{t("spaces.title", "Spaces")}
						</NavLink>
					</li>
					<li>
						<NavLink to="/settings">{t("routes.settings", "Settings")}</NavLink>
					</li>
				</nav>
			</aside>

			<section className="flex-1 p-8">
				<Outlet />
			</section>
		</div>
	);
}

export { Component };
