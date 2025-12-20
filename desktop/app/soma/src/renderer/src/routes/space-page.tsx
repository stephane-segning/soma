import { Link, useParams } from "react-router";
import { useTranslation } from "react-i18next";

function Component(): React.JSX.Element {
	const { t } = useTranslation("common");
	const { spaceId, pageId } = useParams();

	return (
		<div className="space-y-4">
			<div className="flex items-center justify-between">
				<div className="space-y-1">
					<div className="text-xs text-base-content/60">
						{t("space.pages.breadcrumb", "Space page")}
					</div>
					<h2 className="text-lg font-semibold">{pageId ?? t("space.pages.untitled", "Untitled")}</h2>
				</div>
				<div className="flex gap-2">
					<Link className="btn btn-ghost btn-sm" to={`/spaces/${spaceId}/pages`}>
						{t("space.pages.back", "Back")}
					</Link>
					<button type="button" className="btn btn-primary btn-sm">
						{t("space.pages.save", "Save")}
					</button>
				</div>
			</div>

			<div className="prose max-w-none">
				<p className="text-base-content/70">
					{t(
						"space.pages.editorPlaceholder",
						"Notion-like editing will live here (e.g., Yoopta editor).",
					)}
				</p>
			</div>

			<div className="space-y-2">
				<div className="skeleton h-6 w-2/3" />
				<div className="skeleton h-4 w-full" />
				<div className="skeleton h-4 w-11/12" />
				<div className="skeleton h-4 w-4/5" />
			</div>
		</div>
	);
}

export { Component };

