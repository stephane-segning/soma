import type { ImageLayout, ImageSource } from "./types";

type ImageGridProps = {
	effectiveLayout: ImageLayout;
	name?: string;
	sources: ImageSource[];
};

export function ImageGrid({ effectiveLayout, name, sources }: ImageGridProps) {
	const imageClassName = effectiveLayout === "cover" ? "h-full w-full object-cover" : "w-full object-contain";
	const figureGridClassName = sources.length > 1 ? "grid gap-3 sm:grid-cols-2" : "";

	return (
		<div className={figureGridClassName}>
			{sources.map((item, index) => (
				<img
					key={`${item.src}-${index}`}
					src={item.src}
					alt={item.alt ?? name ?? "image"}
					loading="lazy"
					className={`rounded-lg border border-base-300 ${imageClassName}`}
					style={item.width && item.height && effectiveLayout !== "cover" ? { aspectRatio: `${item.width} / ${item.height}` } : undefined}
				/>
			))}
		</div>
	);
}
