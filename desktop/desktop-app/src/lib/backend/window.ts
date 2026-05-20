import { call } from "./client";

export type WindowControlAction = "minimize" | "toggleMaximize" | "close";

/**
 * Window controls. Both shapes are exposed:
 *  - `windowControls.dispatch({ action })` matches the existing renderer
 *    `window:control` channel.
 *  - `windowControls.minimize()` etc. are one-shot convenience calls.
 */
export const windowControls = {
	dispatch: (action: WindowControlAction) => call<void>("window_control", { args: { action } }),
	minimize: () => call<void>("window_minimize"),
	toggleMaximize: () => call<void>("window_toggle_maximize"),
	close: () => call<void>("window_close"),
};
