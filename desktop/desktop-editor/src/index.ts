export type { JSONContent } from "@tiptap/core";
export type { Editor } from "@tiptap/react";

export { defaultCommands } from "./commands/default-commands";
export type { DocumentEditorProps } from "./components/document-editor";
export { DocumentEditor } from "./components/document-editor";
export { AccordionNode } from "./extensions/accordion";
export type { BlobFileUploadResult } from "./extensions/blob-file";
export { BlobFileNode } from "./extensions/blob-file";
export type { BlobImageUploadResult } from "./extensions/blob-image";
export { BlobImageNode } from "./extensions/blob-image";
export { CarouselNode } from "./extensions/carousel";
export type { EditorCommand } from "./extensions/commander";
export { CommanderExtension } from "./extensions/commander";
export type { MentionItem, MentionProvider } from "./extensions/link-mention";
export { createLinkMentionExtension } from "./extensions/link-mention";
export type {
	NodeAIRegistryExtensionOptions,
	NodeAIRegistryStorage,
} from "./extensions/node-ai-registry";
export {
	getNodeAIStorage,
	NodeAIRegistryExtension,
	normalizeNodeName,
} from "./extensions/node-ai-registry";
export { PageLinkNode } from "./extensions/page-link";
export { TextRotateNode } from "./extensions/text-rotate";
export { ActionMenu } from "./menus/action-menu";

export type {
	NodeAITrigger,
	QuickActionRequest,
	QuickActionResponse,
	QuickActionType,
} from "./menus/contextual-menu";
