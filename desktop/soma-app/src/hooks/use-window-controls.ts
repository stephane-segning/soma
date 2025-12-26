import { useMemo } from "react";
import { windowControls } from "../services/window-service";

export function useWindowControls() {
	return useMemo(
		() => ({
			minimize: () => windowControls.minimize(),
			toggleMaximize: () => windowControls.toggleMaximize(),
			close: () => windowControls.close(),
		}),
		[],
	);
}

