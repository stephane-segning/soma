import { createHashRouter, RouterProvider } from "react-router";
import type { RouteObject } from "react-router";

const routes: RouteObject[] = [
	{
		path: "/",
		lazy: () => import("./layouts/app-layout"),
		children: [
			{ index: true, lazy: () => import("./screens/root-redirect") },
			{
				path: "spaces",
				lazy: () => import("./layouts/spaces-layout"),
				children: [
					{ index: true, lazy: () => import("./screens/spaces") },
					{ path: "join", lazy: () => import("./screens/spaces-join") },
					{ path: "landing", lazy: () => import("./screens/spaces-landing") },
				],
			},
			{
				path: "spaces/:spaceId",
				lazy: () => import("./layouts/space-layout"),
				children: [
					{ index: true, lazy: () => import("./screens/space-pages") },
					{ path: "pages", lazy: () => import("./screens/space-pages") },
					{ path: "pages/:pageId", lazy: () => import("./screens/space-page") },
					{ path: "members", lazy: () => import("./screens/space-members") },
					{ path: "settings", lazy: () => import("./screens/space-settings") },
				],
			},
			{
				path: "settings",
				lazy: () => import("./layouts/settings-layout"),
				children: [{ index: true, lazy: () => import("./screens/settings") }],
			},
			{ path: "*", lazy: () => import("./screens/not-found") },
		],
	},
];

const router = createHashRouter(routes);

function AppRouter(): React.JSX.Element {
	return <RouterProvider router={router} />;
}

export { AppRouter };
