import { Link } from "react-router";
import { DesktopShell } from "soma-ui/components/layout/desktop-shell";
import { WindowChrome } from "soma-ui/components/layout/window-chrome";

function HistoryPage() {
	return (
		<DesktopShell
			className="relative"
			header={() => (
				<WindowChrome
					status="online"
					subtitle="Recent activity"
					title="History"
				/>
			)}
		>
			<div className="surface-card rounded-3xl p-6 shadow-xl">
				<h1 className="font-semibold text-xl">Benchmark history</h1>
				<p className="mt-2 text-base-content/70">
					This is a placeholder route for future benchmark and link history.
					Routing is wired so additional pages can slot in without touching the
					intake flow.
				</p>
				<div className="mt-4">
					<Link className="btn btn-ghost btn-sm" to="/">
						Back to intake
					</Link>
				</div>
			</div>
		</DesktopShell>
	);
}

export { HistoryPage };
