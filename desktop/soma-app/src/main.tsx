import "./styles/app.scss";
import "./lib/logging";

import { App } from "@soma/app.tsx";
import { AppErrorBoundary } from "@soma/components/app-error-boundary";
import { store } from "@soma/store/store";
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

createRoot(document.getElementById("root") as HTMLElement).render(
	<StrictMode>
		<AppErrorBoundary>
			<I18nextProvider i18n={i18n}>
				<Provider store={store}>
					<ConfigProvider>
						<App />
					</ConfigProvider>
				</Provider>
			</I18nextProvider>
		</AppErrorBoundary>
	</StrictMode>,
);
