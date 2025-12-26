import { uploadToBlob } from "@soma/lib/blob";
import Accordion from "@yoopta/accordion";
import ActionMenuList, {
	DefaultActionMenuRender,
} from "@yoopta/action-menu-list";
import Blockquote from "@yoopta/blockquote";
import Callout from "@yoopta/callout";
import Code from "@yoopta/code";
import Divider from "@yoopta/divider";
import {
	createYooptaEditor,
	type Tools,
	type YooEditor,
	type YooptaContentValue,
} from "@yoopta/editor";
import type { SlateElement } from "@yoopta/editor/dist/editor/types";
import type { YooptaPlugin } from "@yoopta/editor/dist/plugins";
import type { PluginElementRenderProps } from "@yoopta/editor/dist/plugins/types";
import Embed from "@yoopta/embed";
import File from "@yoopta/file";
import { HeadingOne, HeadingThree, HeadingTwo } from "@yoopta/headings";
import Image from "@yoopta/image";
import Link from "@yoopta/link";
import LinkTool, { DefaultLinkToolRender } from "@yoopta/link-tool";
import { BulletedList, NumberedList, TodoList } from "@yoopta/lists";
import {
	Bold,
	CodeMark,
	Highlight,
	Italic,
	Strike,
	Underline,
} from "@yoopta/marks";
import Paragraph from "@yoopta/paragraph";
import Table from "@yoopta/table";
import Toolbar, { DefaultToolbarRender } from "@yoopta/toolbar";
import Video from "@yoopta/video";
import type React from "react";
import { useCallback, useEffect, useMemo } from "react";
import {
	renderManagedAccordion,
	renderManagedBlockquote,
	renderManagedBulletedList,
	renderManagedCallout,
	renderManagedCode,
	renderManagedEmbed,
	renderManagedFile,
	renderManagedHeadingOne,
	renderManagedHeadingThree,
	renderManagedHeadingTwo,
	renderManagedImage,
	renderManagedLink,
	renderManagedNumberedList,
	renderManagedParagraph,
	renderManagedTable,
	renderManagedTableCell,
	renderManagedTableRow,
	renderManagedTodoList,
	renderManagedVideo,
} from "./managed-renderers";
import { YooptaEditorView } from "./yoopta-editor-view";

type PluginRenderMap = Record<
	string,
	(props: PluginElementRenderProps) => React.JSX.Element
>;
const asPluginRenders = (renders: PluginRenderMap) => renders;

type Props = {
	placeholder?: string;
	readOnly?: boolean;
	className?: string;
	style?: React.CSSProperties;
	initialValue?: YooptaContentValue;
	onValueChange?: (value: YooptaContentValue) => void;
	onSave?: () => void;
	spaceId: string;
	documentId: string;
};

function YooptaEditorWithTools({
	placeholder = "Start writing…",
	readOnly = false,
	className,
	style,
	initialValue,
	onValueChange,
	onSave,
	spaceId,
	documentId,
}: Props): React.JSX.Element {
	const handleSaveShortcut = useCallback(
		(event: KeyboardEvent) => {
			if (readOnly || !onSave) return;
			if (event.key.toLowerCase() !== "s") return;
			if (!event.metaKey && !event.ctrlKey) return;
			event.preventDefault();
			onSave();
		},
		[onSave, readOnly],
	);

	useEffect(() => {
		window.addEventListener("keydown", handleSaveShortcut);
		return () => window.removeEventListener("keydown", handleSaveShortcut);
	}, [handleSaveShortcut]);

	const editor: YooEditor = useMemo(() => createYooptaEditor(), []);

	// Rich toolbelt restored; keep uploads wired through uploadToBlob.
	const plugins = useMemo(
		() =>
			[
				Paragraph.extend({
					renders: asPluginRenders({
						paragraph: renderManagedParagraph,
					}),
				}),
				Table.extend({
					renders: asPluginRenders({
						table: renderManagedTable,
						"table-row": renderManagedTableRow,
						"table-data-cell": renderManagedTableCell,
					}),
				}),
				Divider.extend({
					elementProps: {
						divider: (props) => ({
							...props,
							color: "#007aff",
						}),
					},
				}),
				Accordion.extend({
					renders: asPluginRenders({
						accordion: renderManagedAccordion,
					}),
				}),
				HeadingOne.extend({
					renders: asPluginRenders({
						"heading-one": renderManagedHeadingOne,
					}),
				}),
				HeadingTwo.extend({
					renders: asPluginRenders({
						"heading-two": renderManagedHeadingTwo,
					}),
				}),
				HeadingThree.extend({
					renders: asPluginRenders({
						"heading-three": renderManagedHeadingThree,
					}),
				}),
				Blockquote.extend({
					renders: asPluginRenders({
						blockquote: renderManagedBlockquote,
					}),
				}),
				Callout.extend({
					renders: asPluginRenders({
						callout: renderManagedCallout,
					}),
				}),
				NumberedList.extend({
					renders: asPluginRenders({
						"numbered-list": renderManagedNumberedList,
					}),
				}),
				BulletedList.extend({
					renders: asPluginRenders({
						"bulleted-list": renderManagedBulletedList,
					}),
				}),
				TodoList.extend({
					renders: asPluginRenders({
						"todo-list": renderManagedTodoList,
					}),
				}),
				Code.extend({
					renders: asPluginRenders({
						code: renderManagedCode,
						"code-inline": renderManagedCode,
					}),
				}),
				Link.extend({
					renders: asPluginRenders({
						link: renderManagedLink,
					}),
				}),
				Embed.extend({
					renders: asPluginRenders({
						embed: renderManagedEmbed,
					}),
				}),
				Image.extend({
					renders: asPluginRenders({ image: renderManagedImage }),
					options: {
						async onUpload(file) {
							const data = await uploadToBlob(file, "image", {
								spaceId,
								docId: documentId,
							});
							return {
								src: data.secure_url,
								alt: file.name,
								sizes: { width: data.width, height: data.height },
							};
						},
					},
				}),
				Video.extend({
					renders: asPluginRenders({ video: renderManagedVideo }),
					options: {
						onUpload: async (file) => {
							const data = await uploadToBlob(file, "video", {
								spaceId,
								docId: documentId,
							});
							return {
								src: data.secure_url,
								sizes: { width: data.width, height: data.height },
							};
						},
						onUploadPoster: async (file) => {
							const image = await uploadToBlob(file, "image", {
								spaceId,
								docId: documentId,
							});
							return image.secure_url;
						},
					},
				}),
				File.extend({
					renders: asPluginRenders({ file: renderManagedFile }),
					options: {
						onUpload: async (file) => {
							const response = await uploadToBlob(file, "auto", {
								spaceId,
								docId: documentId,
							});
							return {
								src: response.secure_url,
								format: response.format,
								name: response.name,
								size: response.bytes,
							};
						},
					},
				}),
			] as YooptaPlugin<Record<string, SlateElement>>[],
		[],
	);

	const marks = useMemo(
		() => [Bold, Italic, Underline, Strike, CodeMark, Highlight],
		[],
	);

	const tools: Partial<Tools> = useMemo(
		() => ({
			ActionMenu: { tool: ActionMenuList, render: DefaultActionMenuRender },
			Toolbar: { tool: Toolbar, render: DefaultToolbarRender },
			LinkTool: { tool: LinkTool, render: DefaultLinkToolRender },
		}),
		[],
	);

	return (
		<YooptaEditorView
			className={className}
			editor={editor}
			marks={marks}
			onChange={(nextValue) => onValueChange?.(nextValue)}
			placeholder={placeholder}
			plugins={plugins}
			readOnly={readOnly}
			style={style}
			tools={tools}
			value={initialValue}
		/>
	);
}

export { YooptaEditorWithTools };
