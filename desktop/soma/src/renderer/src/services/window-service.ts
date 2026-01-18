import { windowControls as ipcWindowControls } from "../lib/ipc";

export const windowControls = {
	minimize(): void {
		void ipcWindowControls.minimize();
	},
	toggleMaximize(): void {
		void ipcWindowControls.toggleMaximize();
	},
	close(): void {
		void ipcWindowControls.close();
	},
};
