import { DesktopToaster } from "@soma/ui/components/overlays/toast";
import React from "react";
import ReactDOM from "react-dom/client";
import { IntlProvider } from "react-intl";
import { RouterProvider } from "react-router";
import { DeepLinkListener } from "./components/deep-link/deep-link-listener";
import { AppErrorBoundary } from "./components/error-boundary/app-error-boundary";
import { CommandPaletteRoot } from "./components/palette/command-palette-root";
import { CommandPaletteProvider } from "./components/palette/use-command-palette";
import "./lib/i18n";
import { ShellControlsProvider } from "./lib/shell-controls";
import { router } from "./routes/router";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
	<React.StrictMode>
		{/* Outermost safety net — see AppErrorBoundary's doc comment for why
		    this has to wrap everything, including providers, rather than
		    living inside them: it's the only thing that can catch a crash
		    in CommandPaletteRoot, which is a sibling of <RouterProvider/>
		    and so invisible to the router's own per-route errorElements. */}
		<AppErrorBoundary>
			<IntlProvider defaultLocale="en" locale="en" messages={{}}>
				<ShellControlsProvider>
					<CommandPaletteProvider>
						<RouterProvider router={router} />
						<CommandPaletteRoot />
						{/* Mounted once, globally, same rationale as CommandPaletteRoot
						    above: a soma://invite/... deep link can arrive at any time,
						    including before the user has navigated anywhere in
						    particular, so there is no route component guaranteed to be
						    mounted when it does — see DeepLinkListener’s own doc
						    comment. */}
						<DeepLinkListener />
						{/* Mounted once, globally: ADR-0005 §6 reserves toasts for
						    cross-cutting transient notifications (primary-action
						    feedback must stay inline). See practice.tsx's session-
						    complete notify.success() call for the one call site
						    that currently uses it. */}
						<DesktopToaster />
					</CommandPaletteProvider>
				</ShellControlsProvider>
			</IntlProvider>
		</AppErrorBoundary>
	</React.StrictMode>,
);
