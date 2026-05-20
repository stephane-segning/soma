import React from "react";
import ReactDOM from "react-dom/client";
import { IntlProvider } from "react-intl";
import App from "./App";
import "./lib/i18n";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
	<React.StrictMode>
		<IntlProvider defaultLocale="en" locale="en" messages={{}}>
			<App />
		</IntlProvider>
	</React.StrictMode>,
);
