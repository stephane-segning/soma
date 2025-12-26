import { CommandPaletteShell } from "@soma/components/command-palette.tsx";
import { RouterListener } from "@soma/components/router-listener";
import { Outlet } from "react-router";

function Component(): React.JSX.Element {
	return (
		<div className="min-h-dvh w-full">
			<Outlet />
			<CommandPaletteShell />
			<RouterListener />
		</div>
	);
}

export { Component };
