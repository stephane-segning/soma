import { useTranslation } from "react-i18next";

function Component(): React.JSX.Element {
	const { t } = useTranslation("common");

	return (
		<div className="space-y-4">
			<h2 className="font-semibold text-lg">{t("space.settings.title", "Space settings")}</h2>
			<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
				<label className="form-control w-full">
					<span className="label-text">{t("space.settings.name", "Display name")}</span>
					<input className="input input-bordered w-full" placeholder="My space" />
				</label>
				<label className="form-control w-full">
					<span className="label-text">{t("space.settings.role", "Your role")}</span>
					<input className="input input-bordered w-full" disabled value="member" />
				</label>
			</div>

			<div className="card border border-base-300 bg-base-200">
				<div className="card-body">
					<h3 className="card-title text-base">{t("space.settings.danger", "Danger zone")}</h3>
					<div className="flex items-center justify-between">
						<span className="text-base-content/70 text-sm">
							{t("space.settings.leaveHint", "Leave this space and remove local capability.")}
						</span>
						<button className="btn btn-error btn-sm" type="button">
							{t("space.settings.leave", "Leave space")}
						</button>
					</div>
				</div>
			</div>
		</div>
	);
}

export { Component };
