import { useTranslation } from "react-i18next";

function Component(): React.JSX.Element {
	const { t } = useTranslation("common");

	return (
		<div className="space-y-4">
			<h1 className="text-xl font-semibold">{t("app.title", "Soma")}</h1>
			<p className="text-base-content/70">
				{t("home.subtitle", "Join a space with an invite, or open an existing space from your list.")}
			</p>
			<div className="card bg-base-100 border border-base-300">
				<div className="card-body">
					<div className="skeleton h-10 w-full" />
					<div className="skeleton h-10 w-5/6" />
					<div className="skeleton h-10 w-2/3" />
				</div>
			</div>
		</div>
	);
}

export { Component };
