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
					alt={item.alt ?? name ?? "image"}
					className={`rounded-lg border border-base-300 ${imageClassName}`}
					key={`${item.src}-${index}`}
					loading="lazy"
					src={item.src}
					style={
						item.width && item.height && effectiveLayout !== "cover"
							? { aspectRatio: `${item.width} / ${item.height}` }
							: undefined
					}
				/>
			))}
		</div>
	);
}
