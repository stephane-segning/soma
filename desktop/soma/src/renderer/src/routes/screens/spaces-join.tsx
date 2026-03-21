import { JoinRequestPanel } from "./join-request-panel";
import { Link } from "react-router";

function Component(): React.JSX.Element {
	return (
		<div className="space-y-5">
			<div className="space-y-2">
				<h1 className="font-semibold text-2xl">Join a space</h1>
				<p className="max-w-2xl text-base-content/70 text-sm">
					Use the connection details shared by an existing member to request access to a private space.
				</p>
				<p className="max-w-2xl text-base-content/60 text-sm">
					Connection details help Soma reach an approver. They do not grant membership on their own.
				</p>
			</div>

			<div className="rounded-2xl border border-base-300 bg-base-100 p-5">
				<JoinRequestPanel />
			</div>

			<div className="flex flex-wrap gap-3">
				<Link className="btn btn-ghost btn-sm" to="/spaces/landing">
					Back to spaces
				</Link>
			</div>
		</div>
	);
}

export { Component };
