import ActionMenuList, {
	DefaultActionMenuRender,
} from "@yoopta/action-menu-list";
import {
	createYooptaEditor,
	type Tools,
	type YooEditor,
	type YooptaContentValue,
} from "@yoopta/editor";
import Paragraph from "@yoopta/paragraph";
import Blockquote from "@yoopta/blockquote";
import Embed from "@yoopta/embed";
import Image from "@yoopta/image";
import Link from "@yoopta/link";
import Callout from "@yoopta/callout";
import Video from "@yoopta/video";
import File from "@yoopta/file";
import Accordion from "@yoopta/accordion";
import { BulletedList, NumberedList, TodoList } from "@yoopta/lists";
import {
	Bold,
	CodeMark,
	Highlight,
	Italic,
	Strike,
	Underline,
} from "@yoopta/marks";
import { HeadingOne, HeadingThree, HeadingTwo } from "@yoopta/headings";
import Code from "@yoopta/code";
import Table from "@yoopta/table";
import Divider from "@yoopta/divider";
import Toolbar, { DefaultToolbarRender } from "@yoopta/toolbar";
import LinkTool, { DefaultLinkToolRender } from "@yoopta/link-tool";
import { useMemo, useState } from "react";

import { YooptaEditorView } from "./yoopta-editor-view";
import { uploadToBlob } from "@renderer/lib/blob";
import { YooptaPlugin } from "@yoopta/editor/dist/plugins";
import { SlateElement } from "@yoopta/editor/dist/editor/types";

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
	const plugins = useMemo(
		() => [
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
							sizes: {
								width: data.width,
								height: data.height,
							},
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
							sizes: {
								width: data.width,
								height: data.height,
							},
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
		],
		[],
	) as YooptaPlugin<Record<string, SlateElement>>[];

	const marks = useMemo(
		() => [Bold, Italic, Underline, Strike, CodeMark, Highlight],
		[],
	);

	const tools: Partial<Tools> = useMemo(
		() => ({
			ActionMenu: {
				tool: ActionMenuList,
				render: DefaultActionMenuRender,
			},
			Toolbar: {
				tool: Toolbar,
				render: DefaultToolbarRender,
			},
			LinkTool: {
				render: DefaultLinkToolRender,
				tool: LinkTool,
			},
		}),
		[],
	);

	const [value, setValue] = useState<YooptaContentValue | undefined>(
		() => initialValue,
	);

	return (
		<YooptaEditorView
			className={className}
			editor={editor}
			marks={marks}
			onChange={(nextValue) => {
				setValue(nextValue);
				onValueChange?.(nextValue);
			}}
			placeholder={placeholder}
			plugins={plugins}
			readOnly={readOnly}
			style={style}
			tools={tools}
			value={value}
		/>
	);
}

export { YooptaEditorWithTools };
