import { LimitPercentage } from "./limit-percentage";
import { useLowlight } from "../hooks/lowlight";
import { ContextualMenu, type NodeAITrigger, type QuickActionRequest, type QuickActionResponse } from "../menus/contextual-menu";
import type { JSONContent } from "@tiptap/core";
import { EditorContent, useEditor } from "@tiptap/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { defaultCommands } from "../commands/default-commands";
import type { BlobFileUploadResult } from "../extensions/blob-file";
import type { BlobImageUploadResult } from "../extensions/blob-image";
import type { EditorCommand } from "../extensions/commander";
import type { MentionProvider } from "../extensions/link-mention";
import type { NodeAIRegistryExtensionOptions } from "../extensions/node-ai-registry";
import { ActionMenu } from "../menus/action-menu";
import { createDefaultAIRegistry } from "../menus/ai-registry";
import { createDocumentExtensions } from "./document-editor/extensions";
import { insertFileFromPicker, insertImageFromPicker } from "./document-editor/file-pickers";

export type DocumentEditorProps = {
	className?: string;
	placeholder?: string;
	initialContent?: JSONContent | null;
	commands?: EditorCommand[];
	uploadImage?: (file: File) => Promise<BlobImageUploadResult>;
	uploadFile?: (file: File) => Promise<BlobFileUploadResult>;
	onOpenPageLink?: (pageId: string, title?: string, href?: string) => void;
	onRenamePageLink?: (pageId: string, nextTitle: string, currentTitle?: string) => string | null | Promise<string | null>;
	mentionProviders?: MentionProvider[];
	onChange?: (doc: JSONContent) => void;
	limit?: number;
	onQuickAction?: (input: QuickActionRequest) => Promise<QuickActionResponse>;
};

export function DocumentEditor({
	className,
	placeholder = "Start writing...",
	initialContent,
	commands,
	uploadImage,
	uploadFile,
	onOpenPageLink,
	onRenamePageLink,
	mentionProviders,
	onChange,
	limit,
	onQuickAction,
}: DocumentEditorProps): React.JSX.Element {
	const effectiveCommands = commands ?? defaultCommands;
	const lowlight = useLowlight();
	const extensions = useMemo(
		() =>
			createDocumentExtensions({
				commands: effectiveCommands,
				limit,
				lowlight,
				mentionProviders,
				onOpenPageLink,
				onRenamePageLink,
				placeholder,
				uploadFile,
				uploadImage,
			}),
		[effectiveCommands, limit, lowlight, mentionProviders, onOpenPageLink, onRenamePageLink, placeholder, uploadFile, uploadImage],
	);

	const editor = useEditor({
		extensions,
		content: initialContent ?? undefined,
		immediatelyRender: false,
		editorProps: {
			attributes: {
				class: [
					"min-h-[70vh] w-full",
					"focus:outline-none",
					"prose dark:prose-invert prose-slate md:prose-lg lg:prose-xl max-w-none",
					"prose-p:leading-7",
					"prose-img:rounded-xl prose-headings:text-secondary prose-a:text-blue-600 prose-a:underline prose-a:decoration-blue-300 prose-a:underline-offset-2",
				].join(" "),
			},
		},
		onUpdate: ({ editor }) => onChange?.(editor.getJSON()),
	});

	// Build the AI registry once we have an editor reference. The
	// NodeAIRegistryExtension was mounted with `registry: null`; we mutate
	// its options here so the extension's dispatch / resolve sees the
	// real catalog without forcing a full extension reload.
	const aiRegistry = useMemo(
		() => (editor ? createDefaultAIRegistry({ editor, onQuickAction }) : null),
		[editor, onQuickAction],
	);
	useEffect(() => {
		if (!editor) return;
		const ext = editor.extensionManager.extensions.find(
			(e) => e.name === "nodeAIRegistry",
		);
		if (!ext) return;
		(ext.options as NodeAIRegistryExtensionOptions).registry = aiRegistry;
	}, [editor, aiRegistry]);

	// Node-level AI trigger: set by ActionMenu when the drag-handle AI button
	// is clicked, consumed by ContextualMenu to open the SelectionAIBar.
	const [nodeAITrigger, setNodeAITrigger] = useState<NodeAITrigger | null>(null);
	const handleAskAIForNode = useCallback((trigger: NodeAITrigger) => {
		setNodeAITrigger(trigger);
	}, []);
	const handleNodeAIClose = useCallback(() => {
		setNodeAITrigger(null);
	}, []);

	return (
		<div className={className}>
			<div className="relative">
				<ActionMenu
					editor={editor}
					onInsertFile={(targetEditor, insertPos) => insertFileFromPicker(targetEditor, insertPos, uploadFile)}
					onInsertImage={(targetEditor, insertPos) => insertImageFromPicker(targetEditor, insertPos, uploadImage)}
					onAskAIForNode={onQuickAction ? handleAskAIForNode : undefined}
				/>
				<EditorContent editor={editor} />
				{editor && (
					<ContextualMenu
						editor={editor}
						registry={aiRegistry}
						nodeAITrigger={nodeAITrigger}
						onNodeAIClose={handleNodeAIClose}
					/>
				)}
				{editor && limit && <LimitPercentage editor={editor} limit={limit} />}
			</div>
		</div>
	);
}
