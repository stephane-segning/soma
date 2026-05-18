export type PersistedDesktopShellState = {
	leftOpen?: boolean;
	rightOpen?: boolean;
	leftWidth?: number;
	rightWidth?: number;
};

export function readPersistedState(
	storageKey?: string,
): PersistedDesktopShellState | null {
	if (!storageKey || typeof window === "undefined") return null;
	try {
		const raw = window.localStorage.getItem(storageId(storageKey));
		return raw ? (JSON.parse(raw) as PersistedDesktopShellState) : null;
	} catch {
		return null;
	}
}

export function writePersistedState(
	storageKey: string | undefined,
	state: PersistedDesktopShellState,
): void {
	if (!storageKey || typeof window === "undefined") return;
	try {
		window.localStorage.setItem(storageId(storageKey), JSON.stringify(state));
	} catch {
		// Ignore persistence failures (e.g. storage quota / privacy mode).
	}
}

function storageId(storageKey: string): string {
	return `desktop-shell:${storageKey}`;
}
