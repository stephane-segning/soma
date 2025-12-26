import { CommandPaletteShell } from "@soma/components/command-palette.tsx";
import { RouterListener } from "@soma/components/router-listener";
import { SpacesRail } from "@soma/components/spaces-rail";
import { Outlet } from "react-router";

function Component(): React.JSX.Element {
	return (
		<>
			<div className="flex h-full w-full overflow-hidden">
				<aside className="w-20 shrink-0 border-base-300 border-r bg-base-200/60">
					<SpacesRail />
				</aside>

				<div className="flex flex-1 overflow-hidden">
					<div className="flex-1 overflow-hidden">
						<Outlet />
					</div>
				</div>
			</div>
			<CommandPaletteShell />
			<RouterListener />
		</>
	);
}

export { Component };
