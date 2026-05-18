export type { EditorCommand } from "./extensions/commander";
export { CommanderExtension } from "./extensions/commander";

export { defaultCommands } from "./commands/default-commands";

export { ActionMenu } from "./menus/action-menu";

export type { DocumentEditorProps } from "./components/document-editor";
export { DocumentEditor } from "./components/document-editor";

export type { JSONContent } from "@tiptap/core";

export type { BlobFileUploadResult } from "./extensions/blob-file";
export { BlobFileNode } from "./extensions/blob-file";

export type { BlobImageUploadResult } from "./extensions/blob-image";
export { BlobImageNode } from "./extensions/blob-image";

export { PageLinkNode } from "./extensions/page-link";
export { TextRotateNode } from "./extensions/text-rotate";
export { CarouselNode } from "./extensions/carousel";
export { AccordionNode } from "./extensions/accordion";

export type { MentionItem, MentionProvider } from "./extensions/link-mention";
export { createLinkMentionExtension } from "./extensions/link-mention";

export type { NodeAIRegistryExtensionOptions } from "./extensions/node-ai-registry";
export {
	getNodeAIStorage,
	NodeAIRegistryExtension,
} from "./extensions/node-ai-registry";
