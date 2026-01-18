export async function getSetting<T>(key: string): Promise<T | null> {
	try {
		const value = await import("../lib/ipc").then(({ invoke }) =>
			invoke<T | null>("settings_get", {
				key,
			}),
		);
		return value ?? null;
	} catch (error) {
		console.warn("Failed to read setting from store", error);
		return null;
	}
}

export async function setSetting(key: string, value: unknown): Promise<void> {
	try {
		const { invoke } = await import("../lib/ipc");
		await invoke("settings_set", {
			key,
			value,
		});
	} catch (error) {
		console.warn("Failed to persist setting via store", error);
	}
}
