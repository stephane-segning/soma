import { useTranslation } from "react-i18next";

function Component(): React.JSX.Element {
	const { t } = useTranslation("common");

	return (
		<div className="space-y-6">
			<div className="card border border-base-300 bg-base-100 shadow-sm">
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
							<span className="label-text">
								{t("join.spaceId", "Space ID")}
							</span>
							<input
								aria-label={t("join.spaceId", "Space ID")}
								className="input input-bordered w-full"
								placeholder={t("join.spaceIdPlaceholder", "space_...")}
							/>
						</label>
						<label className="form-control w-full">
							<span className="label-text">
								{t("join.inviteSecret", "Invite secret")}
							</span>
							<input
								aria-label={t("join.inviteSecret", "Invite secret")}
								className="input input-bordered w-full"
								placeholder={t("join.inviteSecretPlaceholder", "secret_...")}
							/>
						</label>
						<label className="form-control w-full">
							<span className="label-text">
								{t("join.displayName", "Display name")}
							</span>
							<input
								aria-label={t("join.displayName", "Display name")}
								className="input input-bordered w-full"
								placeholder={t("join.displayNamePlaceholder", "Your name")}
							/>
						</label>
						<label className="form-control w-full">
							<span className="label-text">
								{t("join.deviceName", "Device name")}
							</span>
							<input
								aria-label={t("join.deviceName", "Device name")}
								className="input input-bordered w-full"
								placeholder={t("join.deviceNamePlaceholder", "MacBook Pro")}
							/>
						</label>
					</div>

					<div className="card-actions justify-end">
						<button className="btn btn-primary" type="button">
							{t("join.submit", "Request to join")}
						</button>
					</div>
				</div>
			</div>

			<div className="alert alert-info">
				<span>
					{t("join.note", "Join flow wiring to the daemon API comes next.")}
				</span>
			</div>
		</div>
	);
}

export { Component };
