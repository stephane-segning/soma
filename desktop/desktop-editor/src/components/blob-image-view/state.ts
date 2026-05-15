import type { ImageLayout, ImageSource } from "./types";

export function resolveImageSources(input: {
	raw: unknown;
	src?: string;
	name?: string;
	width?: number;
	height?: number;
}): ImageSource[] {
	if (Array.isArray(input.raw) && input.raw.length > 0) return input.raw as ImageSource[];
	if (input.src) {
		return [{ src: input.src, alt: input.name, width: input.width, height: input.height }];
	}
	return [];
}

export function resolveImageLayout(input: {
	displayHeight: number | null;
	displayWidth: number | null;
	layoutAttr: unknown;
	sourceCount: number;
}) {
	const { displayHeight, displayWidth, layoutAttr, sourceCount } = input;
	const layout = ((layoutAttr as ImageLayout | undefined) ?? "center") as ImageLayout;
	const effectiveLayout = sourceCount > 1 && layout === "cover" ? "center" : layout;
	const containerClassName = effectiveLayout === "center" ? "mx-auto" : "w-full";
	const containerStyle =
		effectiveLayout === "center"
			? { width: displayWidth ? `${displayWidth}px` : undefined, maxWidth: "100%" }
			: effectiveLayout === "cover"
				? { height: displayHeight ? `${displayHeight}px` : "320px" }
				: undefined;

	return { containerClassName, containerStyle, effectiveLayout };
}
