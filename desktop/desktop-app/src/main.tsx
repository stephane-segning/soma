import React from "react";
import ReactDOM from "react-dom/client";
import { IntlProvider } from "react-intl";
import { RouterProvider } from "react-router";
import { CommandPaletteRoot } from "./components/palette/command-palette-root";
import { CommandPaletteProvider } from "./components/palette/use-command-palette";
import "./lib/i18n";
import { ShellControlsProvider } from "./lib/shell-controls";
import { router } from "./routes/router";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
	<React.StrictMode>
		<IntlProvider defaultLocale="en" locale="en" messages={{}}>
			<ShellControlsProvider>
				<CommandPaletteProvider>
					<RouterProvider router={router} />
					<CommandPaletteRoot />
				</CommandPaletteProvider>
			</ShellControlsProvider>
		</IntlProvider>
	</React.StrictMode>,
);
