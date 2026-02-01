import { cn } from "@soma/ui/utils/cn";
import type { NodeViewProps } from "@tiptap/core";
import { NodeViewWrapper } from "@tiptap/react";

type AccordionItem = {
	title: string;
	content: string;
};

const fallbackItems: AccordionItem[] = [
	{ title: "Accordion Item 1", content: "Add accordion content here." },
	{ title: "Accordion Item 2", content: "Second item details." },
];

export function AccordionView({ node }: NodeViewProps): React.JSX.Element {
	const items = (node.attrs.items as AccordionItem[] | undefined) ?? fallbackItems;
	const className = node.attrs.className as string | undefined;
	const itemClassName = node.attrs.itemClassName as string | undefined;
	const collapseType = (node.attrs.collapseType as "arrow" | "plus" | undefined) ?? "arrow";

	return (
		<NodeViewWrapper as="div" className="my-3" contentEditable={false}>
			<div className={cn("w-full space-y-2", className)}>
				{(items.length > 0 ? items : fallbackItems).map((item, index) => (
					<div
						key={`${item.title}-${index}`}
						className={cn(
							"collapse border border-base-300 bg-base-100",
							collapseType === "plus" ? "collapse-plus" : "collapse-arrow",
							itemClassName,
						)}
					>
						<input type="checkbox" />
						<div className="collapse-title text-base font-medium">
							{item.title}
						</div>
						<div className="collapse-content text-sm text-base-content/80">
							<p>{item.content}</p>
						</div>
					</div>
				))}
			</div>
		</NodeViewWrapper>
	);
}
