import type { ReactNode } from "react";
import { createPortal } from "react-dom";

type OverlayPortalProps = {
	children: ReactNode;
	container?: Element | null;
};

export function OverlayPortal({ children, container }: OverlayPortalProps) {
	if (typeof document === "undefined") return null;
	const target = container ?? document.body;

	if (!target) return null;
	return createPortal(children, target);
}
