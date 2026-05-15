import { DesktopShell } from "../../components/layout/desktop-shell";

export function BasicRender() {
	return (
		<DesktopShell>
			<div className="space-y-2">
				<h1 className="font-semibold text-xl">Basic layout</h1>
				<p className="text-base-content/70 text-sm">
					Use DesktopShell to wrap desktop screens with consistent padding and max width.
				</p>
			</div>
		</DesktopShell>
	);
}
