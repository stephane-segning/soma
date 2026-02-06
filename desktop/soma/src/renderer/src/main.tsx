import "./styles/app.scss";
import "./lib/logging";

import { AppErrorBoundary } from "@app/components/app-error-boundary";
import { TabbedApp } from "@app/routes/tabbed-app.tsx";
import { startAgentEventListener } from "@app/services/agent-events";
import { startDomainEventListener } from "@app/services/domain-events";
import { startUploadOutboxWorker } from "@app/services/upload-outbox";
import { store } from "@app/store/store";
import { StrictMode } from "react";
import { ConfigProvider } from "react-avatar";
import { createRoot } from "react-dom/client";
import { I18nextProvider } from "react-i18next";
import { Provider } from "react-redux";
import { i18n } from "./lib/i18n";

const rootElement = document.getElementById("root");
if (!rootElement) {
	throw new Error("Missing root element");
}

startUploadOutboxWorker();
startDomainEventListener();
startAgentEventListener();

createRoot(document.getElementById("root") as HTMLElement).render(
	<StrictMode>
		<AppErrorBoundary>
			<I18nextProvider i18n={i18n}>
				<Provider store={store}>
					<ConfigProvider>
						<TabbedApp />
					</ConfigProvider>
				</Provider>
			</I18nextProvider>
		</AppErrorBoundary>
	</StrictMode>,
);
