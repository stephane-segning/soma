import { dirname, join } from "node:path";
import { app } from "electron";
import { existsSync, readFileSync } from "fs";
import { mkdir, writeFile } from "fs/promises";

type RouteState = {
	lastRoute: string;
};

const DEFAULT_ROUTE = "/spaces/private/pages/welcome";

function getRouteStatePath(): string {
	return join(app.getPath("userData"), "router-state.json");
}

function readLastRoute(): string {
	try {
		const filePath = getRouteStatePath();
		if (!existsSync(filePath)) return DEFAULT_ROUTE;
		const raw = readFileSync(filePath, "utf-8");
		const parsed = JSON.parse(raw) as Partial<RouteState>;
		const lastRoute = parsed.lastRoute;
		if (typeof lastRoute !== "string" || lastRoute.trim().length === 0)
			return DEFAULT_ROUTE;
		if (!lastRoute.startsWith("/")) return `/${lastRoute}`;
		return lastRoute;
	} catch {
		return DEFAULT_ROUTE;
	}
}

async function writeLastRoute(route: string): Promise<void> {
	const normalized = route.startsWith("/") ? route : `/${route}`;
	const filePath = getRouteStatePath();
	await mkdir(dirname(filePath), { recursive: true });
	await writeFile(
		filePath,
		JSON.stringify({ lastRoute: normalized } satisfies RouteState),
		"utf-8",
	);
}

export { DEFAULT_ROUTE, readLastRoute, writeLastRoute };
