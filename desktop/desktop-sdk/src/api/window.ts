import type { WindowControlAction } from "../bindings";
import type { Transport } from "../transport";

export type { WindowControlAction };

/**
 * Window controls. Both shapes are exposed:
 * - `windowControls.dispatch({action})` matches the legacy `window:control`
 *   IPC contract.
 * - `windowControls.minimize()` etc. are one-shot convenience calls.
 *
 * On the HTTP transport these will be no-ops (the BFF doesn't host a
 * window); future browser builds can intercept at the SDK boundary.
 */
export function windowControls(t: Transport) {
	return {
		dispatch: (action: WindowControlAction) => t.invoke<void>("window_control", { args: { action } }),
		minimize: () => t.invoke<void>("window_minimize"),
		toggleMaximize: () => t.invoke<void>("window_toggle_maximize"),
		close: () => t.invoke<void>("window_close"),
	};
}
