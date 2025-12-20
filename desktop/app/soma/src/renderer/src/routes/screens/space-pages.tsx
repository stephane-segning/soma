import { Link, useParams } from "react-router";
import { useTranslation } from "react-i18next";

function Component(): React.JSX.Element {
	const { t } = useTranslation("common");
	const { spaceId } = useParams();

	return (
		<div className="space-y-4">
			<div className="flex items-center justify-between">
				<h2 className="text-lg font-semibold">{t("space.pages.title", "Pages")}</h2>
				<Link className="btn btn-primary btn-sm" to={`/spaces/${spaceId}/pages/demo-page`}>
					{t("space.pages.new", "New page")}
				</Link>
			</div>

			<div className="space-y-2">
				<Link className="btn btn-ghost justify-start" to={`/spaces/${spaceId}/pages/welcome`}>
					{t("space.pages.welcome", "Welcome")}
				</Link>
				<Link className="btn btn-ghost justify-start" to={`/spaces/${spaceId}/pages/notes`}>
					{t("space.pages.notes", "Notes")}
				</Link>
				<div className="skeleton h-10 w-full" />
				<div className="skeleton h-10 w-5/6" />
			</div>
		</div>
	);
}

export { Component };

