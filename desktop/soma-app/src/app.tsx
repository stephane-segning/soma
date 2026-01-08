import { lazy } from "react";
import { ConfigProvider } from "react-avatar";

const TabbedApp = lazy(() =>
	import("@soma/routes/tabbed-app").then((m) => ({
		default: m.TabbedApp,
	})),
);

function App() {
	return (
		<ConfigProvider>
			<TabbedApp />
		</ConfigProvider>
	);
}

export { App };
