import { DocumentEditor } from "@soma/editor";
import type { Meta, StoryObj } from "@storybook/react";
import { PlaygroundRender } from "./document-editor-story/playground";
import {
	formatBubbleContent,
	listsContent,
	markdownShortcutsContent,
} from "./document-editor-story/scenario-content";
import { ScenarioRender } from "./document-editor-story/scenario";

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

export const ListsNested: Story = {
	name: "Lists & nesting",
	render: () => <ScenarioRender content={listsContent} />,
};

export const FormatBubble: Story = {
	name: "Format bubble",
	render: () => <ScenarioRender content={formatBubbleContent} />,
};

export const MarkdownShortcuts: Story = {
	name: "Markdown shortcuts",
	render: () => <ScenarioRender content={markdownShortcutsContent} />,
};
