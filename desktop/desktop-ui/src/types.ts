import type { ReactNode } from "react";

export type DesktopIcon = {
	id: string;
	label: string;
	hint?: string;
	icon?: ReactNode;
	accent?: string;
};

export type RunningApp = {
	id: string;
	title: string;
	icon?: ReactNode;
	status?: "running" | "sleeping" | "attention";
	badge?: string;
	onClose?: () => void;
};

export type OverlayPosition = {
	x: number;
	y: number;
};
