import React from "react";
import ReactDOM from "react-dom/client";
import { IntlProvider } from "react-intl";
import { RouterProvider } from "react-router";
import "./lib/i18n";
import { router } from "./routes/router";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
	<React.StrictMode>
		<IntlProvider defaultLocale="en" locale="en" messages={{}}>
			<RouterProvider router={router} />
		</IntlProvider>
	</React.StrictMode>,
);
