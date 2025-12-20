import { useTranslation } from "react-i18next";

function Component(): React.JSX.Element {
	const { t } = useTranslation("common");

	return (
		<div className="space-y-6">
			<div className="card bg-base-100 shadow-sm border border-base-300">
				<div className="card-body">
					<h1 className="card-title">{t("join.title", "Join space")}</h1>
					<p className="text-base-content/70">
						{t(
							"join.subtitle",
							"Enter a space id and invite secret/token you received from an existing member.",
						)}
					</p>

					<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
						<label className="form-control w-full">
							<span className="label-text">{t("join.spaceId", "Space ID")}</span>
							<input
								className="input input-bordered w-full"
								placeholder={t("join.spaceIdPlaceholder", "space_...")}
								aria-label={t("join.spaceId", "Space ID")}
							/>
						</label>
						<label className="form-control w-full">
							<span className="label-text">{t("join.inviteSecret", "Invite secret")}</span>
							<input
								className="input input-bordered w-full"
								placeholder={t("join.inviteSecretPlaceholder", "secret_...")}
								aria-label={t("join.inviteSecret", "Invite secret")}
							/>
						</label>
						<label className="form-control w-full">
							<span className="label-text">{t("join.displayName", "Display name")}</span>
							<input
								className="input input-bordered w-full"
								placeholder={t("join.displayNamePlaceholder", "Your name")}
								aria-label={t("join.displayName", "Display name")}
							/>
						</label>
						<label className="form-control w-full">
							<span className="label-text">{t("join.deviceName", "Device name")}</span>
							<input
								className="input input-bordered w-full"
								placeholder={t("join.deviceNamePlaceholder", "MacBook Pro")}
								aria-label={t("join.deviceName", "Device name")}
							/>
						</label>
					</div>

					<div className="card-actions justify-end">
						<button type="button" className="btn btn-primary">
							{t("join.submit", "Request to join")}
						</button>
					</div>
				</div>
			</div>

			<div className="alert alert-info">
				<span>{t("join.note", "Join flow wiring to the daemon API comes next.")}</span>
			</div>
		</div>
	);
}

export { Component };

