import type { ContextMenuItem } from "@soma/ui/components/overlays/context-menu";
import { AlignCenter, Crop, Maximize2 } from "react-feather";

type CreateImageMenuItemsInput = {
	displayHeight: number | null;
	displayWidth: number | null;
	updateAttributes: (attrs: Record<string, unknown>) => void;
	width?: number;
};

export function createImageMenuItems({
	displayHeight,
	displayWidth,
	updateAttributes,
	width,
}: CreateImageMenuItemsInput): ContextMenuItem[] {
	return [
		{
			id: "layout-full",
			label: "Full width",
			icon: <Maximize2 className="size-4" />,
			onSelect: () => updateAttributes({ layout: "full", displayWidth: null }),
		},
		{
			id: "layout-center",
			label: "Centered",
			icon: <AlignCenter className="size-4" />,
			onSelect: () => updateAttributes({ layout: "center", displayWidth: displayWidth ?? Math.min(width ?? 720, 720) }),
		},
		{
			id: "layout-cover",
			label: "Cover",
			icon: <Crop className="size-4" />,
			onSelect: () => updateAttributes({ layout: "cover", displayHeight: displayHeight ?? 320, displayWidth: null }),
		},
	];
}
