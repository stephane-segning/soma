import { useEnsurePageMutation, usePagesQuery } from "@renderer/queries/pages";
import { Link, useNavigate, useParams } from "react-router";
import { Plus } from "react-feather";
import { useTranslation } from "react-i18next";

function Component(): React.JSX.Element {
	const { t } = useTranslation("common");
	const { spaceId } = useParams();
	const navigate = useNavigate();

	const resolvedSpaceId = spaceId ?? "";
	const pagesQuery = usePagesQuery(resolvedSpaceId);
	const ensurePage = useEnsurePageMutation();

	return (
		<div className="space-y-4">
			<div className="flex items-center justify-between">
				<h2 className="text-lg font-semibold">
					{t("space.pages.title", "Pages")}
				</h2>
				<button
					className="btn btn-soft btn-circle btn-primary btn-sm"
					aria-label={t("space.pages.new", "New page")}
					disabled={ensurePage.isPending || !resolvedSpaceId}
					onClick={async () => {
						try {
							const page = await ensurePage.mutateAsync({ spaceId: resolvedSpaceId });
							navigate(`/spaces/${resolvedSpaceId}/pages/${page.pageId}`);
						} catch {
							// ignore
						}
					}}
				>
					<Plus size={16} />
				</button>
			</div>

			<div className="space-y-2">
				{pagesQuery.isLoading && (
					<>
						<div className="skeleton h-10 w-full" />
						<div className="skeleton h-10 w-5/6" />
					</>
				)}
				{pagesQuery.data?.map((page) => (
					<Link
						key={page.pageId}
						className="btn btn-ghost justify-start"
						to={`/spaces/${resolvedSpaceId}/pages/${page.pageId}`}
					>
						<div className="flex flex-col items-start">
							<span className="font-medium">{page.title}</span>
							<span className="text-xs text-base-content/60">
								{page.parentPageIds.length > 0
									? `${t("space.pages.parentsLabel", "Parents")}: ${page.parentPageIds.join(", ")}`
									: t("space.pages.noParents", "No parents")}
							</span>
						</div>
					</Link>
				))}
				{!pagesQuery.isLoading && (pagesQuery.data?.length ?? 0) === 0 && (
					<div className="rounded-lg border border-dashed border-base-300 p-4 text-sm text-base-content/70">
						{t(
							"space.pages.empty",
							"Create your first page to start drafting content for this space.",
						)}
					</div>
				)}
			</div>
		</div>
	);
}

export { Component };
