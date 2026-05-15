import { DocumentEditor } from "@soma/editor";
import type { Meta, StoryObj } from "@storybook/react";
import { PlaygroundRender } from "./document-editor-story/playground";

const meta: Meta<typeof DocumentEditor> = {
	title: "Editor/DocumentEditor",
	component: DocumentEditor,
	parameters: {
		layout: "fullscreen",
	},
};

export default meta;
type Story = StoryObj<typeof DocumentEditor>;

export const Playground: Story = {
	render: PlaygroundRender,
};
