import { cn } from "@soma/ui/utils/cn";
import type { NodeViewProps } from "@tiptap/core";
import { NodeViewWrapper } from "@tiptap/react";

const fallbackItems = ["Design systems", "Prototypes", "Docs"];

export function TextRotateView({ node }: NodeViewProps): React.JSX.Element {
	const items = (node.attrs.items as string[] | undefined) ?? fallbackItems;
	const className = node.attrs.className as string | undefined;

	return (
		<NodeViewWrapper
			as="span"
			className={cn("text-rotate", className)}
			contentEditable={false}
		>
			{items.length > 0
				? items.map((item, index) => <span key={index}>{item}</span>)
				: fallbackItems.map((item, index) => <span key={index}>{item}</span>)}
		</NodeViewWrapper>
	);
}
