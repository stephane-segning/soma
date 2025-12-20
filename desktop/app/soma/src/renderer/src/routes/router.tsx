import { createHashRouter, RouterProvider } from "react-router";
import type { RouteObject } from "react-router";

const routes: RouteObject[] = [
	{
		path: "/",
		lazy: () => import("./app-layout"),
		children: [
			{ index: true, lazy: () => import("./root-redirect") },
			{
				path: "spaces",
				lazy: () => import("./spaces-layout"),
				children: [
					{ index: true, lazy: () => import("./spaces") },
					{ path: "join", lazy: () => import("./spaces-join") },
					{ path: "landing", lazy: () => import("./spaces-landing") },
				],
			},
			{
				path: "spaces/:spaceId",
				lazy: () => import("./space-layout"),
				children: [
					{ index: true, lazy: () => import("./space-pages") },
					{ path: "pages", lazy: () => import("./space-pages") },
					{ path: "pages/:pageId", lazy: () => import("./space-page") },
					{ path: "members", lazy: () => import("./space-members") },
					{ path: "settings", lazy: () => import("./space-settings") },
				],
			},
			{
				path: "settings",
				lazy: () => import("./settings-layout"),
				children: [{ index: true, lazy: () => import("./settings") }],
			},
			{ path: "*", lazy: () => import("./not-found") },
		],
	},
];

const router = createHashRouter(routes);

function AppRouter(): React.JSX.Element {
	return <RouterProvider router={router} />;
}

export { AppRouter };
