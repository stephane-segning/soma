import type { Meta, StoryObj } from "@storybook/react";
import { useMemo } from "react";
import { DocumentEditor, type EditorCommand, type JSONContent, defaultCommands } from "@soma/editor";

const meta: Meta<typeof DocumentEditor> = {
	title: "Editor/DocumentEditor",
	component: DocumentEditor,
	parameters: {
		layout: "fullscreen",
	},
};

export default meta;
type Story = StoryObj<typeof DocumentEditor>;

const initialContent: JSONContent = {
	type: "doc",
	content: [
		{
			type: "heading",
			attrs: { level: 1 },
			content: [{ type: "text", text: "Soma Editor" }],
		},
		{
			type: "paragraph",
			content: [
				{
					type: "text",
					text: "Try the slash menu, drag handle, and page link context menu.",
				},
			],
		},
		{
			type: "pageLink",
			attrs: {
				pageId: "page_demo_123",
				title: "Project Brief",
				href: "/spaces/demo/pages/page_demo_123",
			},
		},
	],
};

export const Playground: Story = {
	render: () => {
		const commands = useMemo<EditorCommand[]>(() => {
			return [
				...defaultCommands,
				{
					key: "insert-page-link",
					name: "Insert page link",
					description: "Insert a demo page link block",
					handler: ({ editor, range }) => {
						editor
							.chain()
							.focus()
							.deleteRange(range)
							.insertContent({
								type: "pageLink",
								attrs: {
									pageId: "page_demo_456",
									title: "Design Notes",
									href: "/spaces/demo/pages/page_demo_456",
								},
							})
							.run();
					},
				},
			];
		}, []);

		return (
			<div className="min-h-screen bg-base-100 px-16 py-12">
				<DocumentEditor
					commands={commands}
					initialContent={initialContent}
					onChange={() => {}}
					onOpenPageLink={(pageId) => {
						// eslint-disable-next-line no-alert
						alert(`Open page ${pageId} in new tab`);
					}}
					onRenamePageLink={async (_pageId, nextTitle) => nextTitle}
					placeholder="Start writing..."
				/>
			</div>
		);
	},
};
