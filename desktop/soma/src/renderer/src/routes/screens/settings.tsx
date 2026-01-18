import { useTranslation } from "react-i18next";

function Component(): React.JSX.Element {
	const {
		t,
	} =
		useTranslation(
			"common",
		);

	return (
		<div className="space-y-6">
			<h1 className="font-semibold text-2xl">
				{t(
					"settings.title",
					"Settings",
				)}
			</h1>

			<div className="card border border-base-300 bg-base-100">
				<div className="card-body space-y-4">
					<h2 className="card-title text-base">
						{t(
							"settings.identity",
							"Identity",
						)}
					</h2>
					<div className="space-y-2">
						<div className="skeleton h-5 w-2/3" />
						<div className="skeleton h-5 w-1/2" />
					</div>
				</div>
			</div>

			<div className="card border border-base-300 bg-base-100">
				<div className="card-body space-y-4">
					<h2 className="card-title text-base">
						{t(
							"settings.connectivity",
							"Connectivity",
						)}
					</h2>
					<div className="space-y-2">
						<div className="skeleton h-5 w-full" />
						<div className="skeleton h-5 w-11/12" />
					</div>
				</div>
			</div>
		</div>
	);
}

export {
	Component,
};
