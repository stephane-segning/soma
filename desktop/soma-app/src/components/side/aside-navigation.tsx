import { PageTree } from "@soma/components/page-tree.tsx";
import { useTranslation } from "react-i18next";
import { Link, NavLink, useParams } from "react-router";

function AsideNavigation() {
	const { t } = useTranslation("common");
	const { spaceId, pageId } = useParams();

	return (
		<aside className="flex w-full shrink-0 flex-col border-base-300 border-r bg-base-200/60">
			<div className="border-base-300 border-b px-3 py-3">
				<Link
					className="btn btn-ghost btn-sm w-full justify-start"
					to="/spaces"
				>
					{t("routes.spaces", "Spaces")}
				</Link>
				<div className="mt-2 text-base-content/60 text-xs">
					{spaceId ?? t("space.unknown", "Unknown space")}
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

			<div className="flex-1 overflow-y-auto px-2 py-2">
				<PageTree activePageId={pageId ?? undefined} spaceId={spaceId ?? ""} />
			</div>

			<div className="border-base-300 border-t bg-base-200 px-2 py-2">
				<nav className="menu">
					<li>
						<NavLink to={`/spaces/${spaceId}/settings`}>
							{t("space.tabs.settings", "Settings")}
						</NavLink>
					</li>
				</nav>
			</div>
		</aside>
	);
}

export { AsideNavigation };
