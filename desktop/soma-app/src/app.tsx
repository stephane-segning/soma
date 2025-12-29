import { lazy } from "react";

const TabbedApp = lazy(() =>
	import("@soma/routes/tabbed-app").then((m) => ({
		default: m.TabbedApp,
	})),
);

function App() {
	return <TabbedApp />;
}

export { App };
