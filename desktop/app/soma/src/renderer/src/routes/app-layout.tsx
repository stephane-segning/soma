import { Outlet, Link } from "react-router";
import { useTranslation } from "react-i18next";
import { CommandPaletteShell } from "../components/command-palette";
import "react-cmdk/dist/cmdk.css";

function Component(): React.JSX.Element {
	const { t } = useTranslation("common");

	const sendPing = (): void => window.electron.ipcRenderer.send("ping");

	return (
		<div className="min-h-dvh bg-base-200 text-base-content">
			<div className="navbar bg-base-100 border-b border-base-300">
				<div className="flex-1">
					<Link className="btn btn-ghost text-xl" to="/" aria-label={t("app.title", "Soma")}>
						{t("app.title", "Soma")}
					</Link>
				</div>
				<div className="flex-none gap-2">
					<Link className="btn btn-ghost btn-sm" to="/spaces">
						{t("routes.spaces", "Spaces")}
					</Link>
					<Link className="btn btn-ghost btn-sm" to="/join">
						{t("routes.join", "Join")}
					</Link>
					<Link className="btn btn-ghost btn-sm" to="/settings">
						{t("routes.settings", "Settings")}
					</Link>
				</div>
			</div>

			<main className="mx-auto w-full max-w-5xl p-6">
				<Outlet />
			</main>

			<CommandPaletteShell onSendIpc={sendPing} />
		</div>
	);
}

export { Component };
