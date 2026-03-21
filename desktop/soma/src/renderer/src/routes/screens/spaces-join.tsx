import { useTranslation } from "react-i18next";
import { Link } from "react-router";

function Component(): React.JSX.Element {
	const { t } = useTranslation("common");

	return (
		<div className="space-y-5">
			<div className="space-y-2">
				<h1 className="font-semibold text-2xl">{t("join.title", "Join space")}</h1>
				<p className="max-w-2xl text-base-content/70 text-sm">
					Soma&apos;s current join flow still expects peer details from an existing member. Use the advanced join
					surface to submit a request with a space ID, target peer ID, and multiaddrs.
				</p>
			</div>

			<div className="rounded-2xl border border-base-300 bg-base-100 p-5">
				<h2 className="font-semibold text-base">What you need</h2>
				<ul className="mt-3 list-disc space-y-2 pl-5 text-base-content/70 text-sm">
					<li>The `space_id` you are trying to join</li>
					<li>A target peer ID for the owner or delegated bot</li>
					<li>One or more reachable multiaddrs for that peer</li>
				</ul>
				<div className="mt-5 flex flex-wrap gap-3">
					<Link className="btn btn-primary btn-sm" to="/settings">
						Open advanced join
					</Link>
					<Link className="btn btn-ghost btn-sm" to="/spaces/landing">
						Back to spaces
					</Link>
				</div>
			</div>
		</div>
	);
}

export { Component };
