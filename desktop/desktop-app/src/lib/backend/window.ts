import { call } from "./client";

/**
 * Native window controls — useful for the title-bar's draggable region
 * and the close/minimize/maximize buttons in a frameless window.
 */
export const windowControls = {
	minimize: () => call<void>("window_minimize"),
	toggleMaximize: () => call<void>("window_toggle_maximize"),
	close: () => call<void>("window_close"),
};
