import { invoke } from "@tauri-apps/api/core";

function normalizeRoute(route: string): string {
	const trimmed = route.trim();
	if (!trimmed) return "/spaces/landing";
	return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

export async function getSetting<T>(key: string): Promise<T | null> {
	return invoke<T | null>("settings_get", { key }).catch(() => null);
}

export async function setSetting(key: string, value: unknown): Promise<void> {
	await invoke("settings_set", { key, value }).catch((error) => {
		console.warn("Failed to persist setting via daemon", error);
	});
}

export async function getLastRoute(): Promise<string> {
	const bootstrapRoute = (
		window as unknown as { __SOMA_INITIAL_ROUTE__?: string }
	).__SOMA_INITIAL_ROUTE__;
	if (typeof bootstrapRoute === "string" && bootstrapRoute.trim().length > 0) {
		return normalizeRoute(bootstrapRoute);
	}
	const route = await invoke<string | null>("settings_get_last_route").catch(
		() => null,
	);
	return route ? normalizeRoute(route) : "/spaces/landing";
}

export async function setLastRoute(route: string): Promise<void> {
	const normalized = normalizeRoute(route);
	try {
		await invoke("remember_route", { route: normalized });
	} catch (error) {
		console.warn("Failed to persist route via daemon", error);
	}
}
