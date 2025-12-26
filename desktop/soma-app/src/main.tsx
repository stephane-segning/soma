import "./styles/app.scss";
import "./lib/logging";

import { TabsBar } from "@soma/components/tabs-bar.tsx";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { I18nextProvider } from "react-i18next";
import { i18n } from "./lib/i18n";
import { TabbedApp } from "./routes/tabbed-app";

const queryClient = new QueryClient();

const rootElement = document.getElementById("root");
if (!rootElement) {
	throw new Error("Missing root element");
}

createRoot(document.getElementById("root") as HTMLElement).render(
	<StrictMode>
		<I18nextProvider i18n={i18n}>
			<QueryClientProvider client={queryClient}>
				<TabsBar />
				<TabbedApp />
			</QueryClientProvider>
		</I18nextProvider>
	</StrictMode>,
);
