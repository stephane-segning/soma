import { createElement, type ReactNode, useMemo } from "react";
import rehypeReact from "rehype-react";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";

export type AiMarkdownProps = {
	content: string;
	className?: string;
};

export function AiMarkdown({ content, className }: AiMarkdownProps) {
	const rendered = useMemo(() => {
		const processor = unified()
			// cast to loosen type strictness for rehype-react
			.use(remarkParse)
			.use(remarkGfm)
			.use(remarkRehype)
			.use(rehypeReact, { createElement });

		const file = processor.processSync(content || "");
		return file.result as ReactNode;
	}, [content]);

	return <div className={className}>{rendered}</div>;
}
