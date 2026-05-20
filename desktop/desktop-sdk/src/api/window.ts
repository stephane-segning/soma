import type { WindowControlAction } from "../bindings";
import type { Transport } from "../transport";

export type { WindowControlAction };

/**
 * Native window controls. Every call routes through a single
 * `window_control` command with an `{ action }` discriminator — this
 * matches both the Tauri presenter
 * (`desktop_commands::window::window_control`) and the Electron handler
 * (`ipc.handle("window_control", …)`), so the same SDK call works under
 * either shell.
 *
 * `minimize` / `toggleMaximize` / `close` are sugar around `dispatch`,
 * kept so call sites can stay readable.
 */
export function windowControls(t: Transport) {
	const dispatch = (action: WindowControlAction) => t.invoke<void>("window_control", { args: { action } });
	return {
		dispatch,
		minimize: () => dispatch("minimize"),
		toggleMaximize: () => dispatch("toggleMaximize"),
		close: () => dispatch("close"),
	};
}
