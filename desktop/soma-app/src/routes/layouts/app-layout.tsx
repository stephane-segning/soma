import { RouterListener } from "@soma/components/router-listener";
import { WindowControls } from "@soma/components/window-controls";
import { Outlet } from "react-router";
import { CommandPaletteShell } from "../../components/command-palette";

function Component(): React.JSX.Element {
	return (
		<div className="min-h-dvh w-full bg-base-200/80">
			miaou
			<div
				className="fixed top-0 right-0 left-0 z-50 flex h-10 items-center gap-4 border-base-300 border-b bg-base-200 px-4 text-base-content [-webkit-app-region:drag]"
				id="app-title"
			>
				<WindowControls />
				<div className="font-semibold text-base-content/70 text-sm uppercase">
					Soma
				</div>
			</div>
			<div className="pt-10">
				<Outlet />
			</div>
			<CommandPaletteShell />
			<RouterListener />
		</div>
	);
}

export { Component };
