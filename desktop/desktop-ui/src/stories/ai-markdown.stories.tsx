import type { Meta, StoryObj } from "@storybook/react";
import { AiMarkdown } from "../components/chat/ai-markdown";

const meta: Meta<typeof AiMarkdown> = {
	title: "Chat/AiMarkdown",
	component: AiMarkdown,
	parameters: { layout: "padded" },
};

export default meta;
type Story = StoryObj<typeof AiMarkdown>;

const PROSE_CONTENT = `
# Heading one

A paragraph with **bold**, _italic_, and \`inline code\` text.

## Heading two

- Item one
- Item two
- Item three

### Heading three

1. First step
2. Second step
3. Third step
`;

const CODE_CONTENT = `
Here is a code block:

\`\`\`ts
function greet(name: string): string {
  return \`Hello, \${name}!\`;
}
\`\`\`

And some more text after the block.
`;

const TABLE_CONTENT = `
| Name     | Role      | Status  |
|----------|-----------|---------|
| Alice    | Engineer  | Online  |
| Bob      | Designer  | Offline |
| Carol    | PM        | Syncing |
`;

const MINIMAL_CONTENT = `Just a plain sentence with no markdown.`;

export const Prose: Story = {
	render: () => (
		<div className="max-w-prose">
			<AiMarkdown
				className="prose prose-sm max-w-none"
				content={PROSE_CONTENT}
			/>
		</div>
	),
};

export const WithCodeBlock: Story = {
	render: () => (
		<div className="max-w-prose">
			<AiMarkdown
				className="prose prose-sm max-w-none"
				content={CODE_CONTENT}
			/>
		</div>
	),
};

export const WithTable: Story = {
	render: () => (
		<div className="max-w-prose">
			<AiMarkdown
				className="prose prose-sm max-w-none"
				content={TABLE_CONTENT}
			/>
		</div>
	),
};

export const Plain: Story = {
	render: () => (
		<div className="max-w-prose">
			<AiMarkdown
				className="prose prose-sm max-w-none"
				content={MINIMAL_CONTENT}
			/>
		</div>
	),
};

export const Empty: Story = {
	render: () => (
		<div className="max-w-prose">
			<AiMarkdown className="prose prose-sm max-w-none" content="" />
		</div>
	),
};

export const DarkTheme: Story = {
	parameters: { theme: "luxury" },
	render: () => (
		<div className="max-w-prose">
			<AiMarkdown
				className="prose prose-sm prose-invert max-w-none"
				content={PROSE_CONTENT}
			/>
		</div>
	),
};
