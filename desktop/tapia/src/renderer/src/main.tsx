import "./assets/main.css";

import { StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { I18nextProvider } from "react-i18next";
import { RouterProvider } from "react-router";
import { i18n } from "./lib/i18n";
import { router } from "./routes/router";

const rootElement = document.getElementById("root");
if (!rootElement) {
	throw new Error("Missing root element");
}

createRoot(rootElement).render(
	<StrictMode>
		<I18nextProvider i18n={i18n}>
			<Suspense fallback={<div className="app-loading">Loading…</div>}>
				<RouterProvider router={router} />
			</Suspense>
		</I18nextProvider>
	</StrictMode>,
);
