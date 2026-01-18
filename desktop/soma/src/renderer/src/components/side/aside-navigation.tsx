import { PageTree } from "@app/components/page-tree.tsx";
import { useCreatePage } from "@app/queries/pages";
import { Plus, Settings, Trash2 } from "react-feather";
import { useTranslation } from "react-i18next";
import { NavLink, useParams } from "react-router";

function AsideNavigation() {
	const { t } = useTranslation("common");
	const { spaceId, pageId } = useParams<{ spaceId: string; pageId: string }>();
	const { createPage, isPending } = useCreatePage(spaceId as string);

	return (
		<aside className="flex h-full w-full shrink-0 flex-col bg-base-100">
			<div className="flex-1 overflow-y-auto p-2">
				<div className="mb-2 flex items-center justify-between font-semibold text-[11px] text-base-content/60 uppercase tracking-[0.12em]">
					<span>{t("space.sidebar.pages", "Pages")}</span>
					<button
						aria-label={t("space.pages.new", "New page")}
						className="btn btn-circle btn-ghost btn-xs"
						disabled={isPending || !spaceId}
						onClick={() => createPage([])}
						type="button"
					>
						<Plus className="size-4" />
					</button>
				</div>

				<PageTree
					activePageId={pageId ?? undefined}
					showNewButton={false}
					spaceId={spaceId ?? ""}
				/>
			</div>

			<div className="border-base-300 border-t p-3">
				<nav className="flex flex-col gap-2 text-base-content/80 text-sm">
					<NavLink
						className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-base-200"
						to={`/spaces/${spaceId}/settings`}
					>
						<Settings className="size-4" />
						<span>{t("space.tabs.settings", "Settings")}</span>
					</NavLink>
					<NavLink
						className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-base-200"
						to={`/spaces/${spaceId}/pages?view=trash`}
					>
						<Trash2 className="size-4" />
						<span>{t("space.sidebar.trash", "Trash")}</span>
					</NavLink>
				</nav>
			</div>
		</aside>
	);
}

export { AsideNavigation };
