import { createHashRouter } from "react-router";
import { ShellLayout } from "./layouts/shell-layout";
import { HistoryPage } from "./pages/history";
import { IntakePage } from "./pages/intake";

const router = createHashRouter([
	{
		path: "/",
		element: <ShellLayout />,
		children: [
			{
				index: true,
				element: <IntakePage />,
			},
			{
				path: "history",
				element: <HistoryPage />,
			},
		],
	},
]);

export { router };
