import { useEffect } from "react";
import { Outlet, useLocation } from "react-router";
import { CommandPaletteShell } from "../components/command-palette";
import "react-cmdk/dist/cmdk.css";

function Component(): React.JSX.Element {
	const location = useLocation();

	const sendPing = (): void => window.electron.ipcRenderer.send("ping");

	useEffect(() => {
		if (location.pathname === "/") return;
		const next = `${location.pathname}${location.search}`;
		window.api.setLastRoute(next);
	}, [location.pathname, location.search]);

	return (
		<div className="min-h-dvh bg-base-200 text-base-content">
			<main className="w-full p-2">
				<Outlet />
			</main>

			<CommandPaletteShell onSendIpc={sendPing} />
		</div>
	);
}

export { Component };
