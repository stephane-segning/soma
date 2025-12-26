import type { RouteObject } from "react-router";
import { createMemoryRouter } from "react-router";

const routes: RouteObject[] = [
	{
		path: "/",
		handle: { title: "Soma" },
		lazy: () => import("./layouts/app-layout"),
		children: [
			{
				index: true,
				handle: { title: "Home" },
				lazy: () => import("./screens/root-redirect"),
			},
			{
				path: "spaces",
				handle: { title: "Spaces" },
				lazy: () => import("./layouts/modal-layout"),
				children: [
					{
						index: true,
						handle: { title: "Spaces" },
						lazy: () => import("./screens/spaces"),
					},
					{
						path: "join",
						handle: { title: "Join Space" },
						lazy: () => import("./screens/spaces-join"),
					},
					{
						path: "landing",
						handle: { title: "Space" },
						lazy: () => import("./screens/spaces-landing"),
					},
				],
			},
			{
				path: "spaces/:spaceId",
				handle: { title: "Space" },
				lazy: () => import("./layouts/space-layout"),
				children: [
					{
						index: true,
						handle: { title: "Pages" },
						lazy: () => import("./screens/space-pages"),
					},
					{
						path: "pages",
						handle: { title: "Pages" },
						lazy: () => import("./screens/space-pages"),
					},
					{
						path: "pages/:pageId",
						handle: { title: "Page" },
						lazy: () => import("./screens/space-page"),
					},
					{
						path: "members",
						handle: { title: "Members" },
						lazy: () => import("./screens/space-members"),
					},
					{
						path: "settings",
						handle: { title: "Space Settings" },
						lazy: () => import("./screens/space-settings"),
					},
				],
			},
			{
				path: "settings",
				handle: { title: "Settings" },
				lazy: () => import("./layouts/modal-layout"),
				children: [
					{
						index: true,
						handle: { title: "Settings" },
						lazy: () => import("./screens/settings"),
					},
				],
			},
			{
				path: "*",
				handle: { title: "Not Found" },
				lazy: () => import("./screens/not-found"),
			},
		],
	},
];

function createTabRouter(initialPath: string) {
	return createMemoryRouter(routes, { initialEntries: [initialPath] });
}

export { createTabRouter, routes };
