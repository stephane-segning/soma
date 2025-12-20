import { useTranslation } from "react-i18next";

function Component(): React.JSX.Element {
	const { t } = useTranslation("common");

	return (
		<div className="space-y-4">
			<h2 className="text-lg font-semibold">
				{t("space.members.title", "Members")}
			</h2>
			<p className="text-base-content/70">
				{t(
					"space.members.subtitle",
					"Roster and roles will render here once wired to the daemon.",
				)}
			</p>
			<div className="space-y-2">
				<div className="skeleton h-10 w-full" />
				<div className="skeleton h-10 w-full" />
				<div className="skeleton h-10 w-5/6" />
			</div>
		</div>
	);
}

export { Component };
