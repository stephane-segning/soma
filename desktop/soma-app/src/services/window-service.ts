export const windowControls = {
	minimize(): void {
		window.api.window?.minimize?.();
	},
	toggleMaximize(): void {
		window.api.window?.toggleMaximize?.();
	},
	close(): void {
		window.api.window?.close?.();
	},
};

