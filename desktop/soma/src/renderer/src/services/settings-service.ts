export async function getSetting<T>(key: string): Promise<T | null> {
	return window.api.getSetting<T>(key);
}

export async function setSetting(key: string, value: unknown): Promise<void> {
	window.ipc.sendToMain("settings:set", { key, value });
}

export async function getLastRoute(): Promise<string> {
	return window.api.getLastRoute();
}

export function setLastRoute(route: string): void {
	window.api.setLastRoute(route);
}

