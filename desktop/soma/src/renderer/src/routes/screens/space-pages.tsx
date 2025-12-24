import { useEnsurePageMutation, usePagesQuery } from "@renderer/queries/pages";
import { Plus } from "react-feather";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router";

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
				<h2 className="font-semibold text-lg">
					{t("space.pages.title", "Pages")}
				</h2>
				<button
					aria-label={t("space.pages.new", "New page")}
					className="btn btn-soft btn-circle btn-primary btn-sm"
					disabled={ensurePage.isPending || !resolvedSpaceId}
					onClick={async () => {
						try {
							const page = await ensurePage.mutateAsync({
								spaceId: resolvedSpaceId,
							});
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
						className="btn btn-ghost justify-start"
						key={page.pageId}
						to={`/spaces/${resolvedSpaceId}/pages/${page.pageId}`}
					>
						<div className="flex flex-col items-start">
							<span className="font-medium">{page.title}</span>
							<span className="text-base-content/60 text-xs">
								{page.parentPageIds.length > 0
									? `${t("space.pages.parentsLabel", "Parents")}: ${page.parentPageIds.join(", ")}`
									: t("space.pages.noParents", "No parents")}
							</span>
						</div>
					</Link>
				))}
				{!pagesQuery.isLoading && (pagesQuery.data?.length ?? 0) === 0 && (
					<div className="rounded-lg border border-base-300 border-dashed p-4 text-base-content/70 text-sm">
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
