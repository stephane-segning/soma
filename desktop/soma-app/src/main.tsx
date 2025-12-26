import "./styles/app.scss";
import "./lib/logging";

import { App } from "@soma/app.tsx";
import { AppErrorBoundary } from "@soma/components/app-error-boundary";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { I18nextProvider } from "react-i18next";
import { i18n } from "./lib/i18n";

const queryClient = new QueryClient();

const rootElement = document.getElementById("root");
if (!rootElement) {
	throw new Error("Missing root element");
}

createRoot(document.getElementById("root") as HTMLElement).render(
	<StrictMode>
		<AppErrorBoundary>
			<I18nextProvider i18n={i18n}>
				<QueryClientProvider client={queryClient}>
					<App />
				</QueryClientProvider>
			</I18nextProvider>
		</AppErrorBoundary>
	</StrictMode>,
);
