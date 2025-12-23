import { uploadToBlob } from "@renderer/lib/blob";
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
import { useMemo } from "react";
import { YooptaEditorView } from "./yoopta-editor-view";

type Props = {
	placeholder?: string;
	readOnly?: boolean;
	className?: string;
	style?: React.CSSProperties;
	initialValue?: YooptaContentValue;
	onValueChange?: (value: YooptaContentValue) => void;
};

function YooptaEditorWithTools({
	placeholder = "Start writing…",
	readOnly = false,
	className,
	style,
	initialValue,
	onValueChange,
}: Props): React.JSX.Element {
	const editor: YooEditor = useMemo(() => createYooptaEditor(), []);
	// Rich toolbelt restored; keep uploads wired through uploadToBlob.
	const plugins = useMemo(
		() =>
			[
				Paragraph,
				Table,
				Divider.extend({
					elementProps: {
						divider: (props) => ({
							...props,
							color: "#007aff",
						}),
					},
				}),
				Accordion,
				HeadingOne,
				HeadingTwo,
				HeadingThree,
				Blockquote,
				Callout,
				NumberedList,
				BulletedList,
				TodoList,
				Code,
				Link,
				Embed,
				Image.extend({
					options: {
						async onUpload(file) {
							const data = await uploadToBlob(file, "image");
							return {
								src: data.secure_url,
								alt: "cloudinary",
								sizes: { width: data.width, height: data.height },
							};
						},
					},
				}),
				Video.extend({
					options: {
						onUpload: async (file) => {
							const data = await uploadToBlob(file, "video");
							return {
								src: data.secure_url,
								alt: "cloudinary",
								sizes: { width: data.width, height: data.height },
							};
						},
						onUploadPoster: async (file) => {
							const image = await uploadToBlob(file, "image");
							return image.secure_url;
						},
					},
				}),
				File.extend({
					options: {
						onUpload: async (file) => {
							const response = await uploadToBlob(file, "auto");
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
			value={initialValue}
			marks={marks}
			onChange={(nextValue) => onValueChange?.(nextValue)}
			placeholder={placeholder}
			plugins={plugins}
			readOnly={readOnly}
			style={style}
			tools={tools}
		/>
	);
}

export { YooptaEditorWithTools };
