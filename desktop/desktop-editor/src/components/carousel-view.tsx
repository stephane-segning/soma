import { cn } from "@soma/ui/utils/cn";
import type { NodeViewProps } from "@tiptap/core";
import { NodeViewWrapper } from "@tiptap/react";

type CarouselItem = {
	src: string;
	alt?: string;
};

export function CarouselView({ node }: NodeViewProps): React.JSX.Element {
	const items = (node.attrs.items as CarouselItem[] | undefined) ?? [];
	const className = node.attrs.className as string | undefined;
	const itemClassName = node.attrs.itemClassName as string | undefined;

	return (
		<NodeViewWrapper as="div" className="my-3" contentEditable={false}>
			<div className={cn("carousel w-full rounded-box", className)}>
				{items.length > 0 ? (
					items.map((item, index) => (
						<div
							className={cn("carousel-item w-full", itemClassName)}
							key={`${item.src}-${index}`}
						>
							<img
								src={item.src}
								alt={item.alt ?? `Slide ${index + 1}`}
								className="w-full object-cover"
							/>
						</div>
					))
				) : (
					<div className="carousel-item w-full">
						<div className="flex h-40 w-full items-center justify-center rounded-box border border-base-300 bg-base-200 text-sm text-base-content/60">
							Add carousel slides
						</div>
					</div>
				)}
			</div>
		</NodeViewWrapper>
	);
}
