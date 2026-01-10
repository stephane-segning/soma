// @ts-nocheck
import type { YooEditor, YooptaBlockData } from "@yoopta/editor";
import { Blocks, UI } from "@yoopta/editor";
import {
	AlignCenter,
	AlignLeft,
	AlignRight,
	ExternalLink,
} from "react-feather";

import type { FileElementProps } from "../types";

const ALIGN_ICONS = {
	left: AlignLeft,
	center: AlignCenter,
	right: AlignRight,
};

const {
	ExtendedBlockActions,
	BlockOptionsMenuGroup,
	BlockOptionsMenuItem,
	BlockOptionsSeparator,
} = UI;

type Props = {
	editor: YooEditor;
	block: YooptaBlockData;
	props?: FileElementProps;
};

const FileBlockOptions = ({ editor, block, props: fileProps }: Props) => {
	const onOpen = () => {
		if (!fileProps?.src) return;
		window.open(fileProps?.src, "_blank");
	};

	const currentAlign = block?.meta?.align || "center";
	const AlignIcon = ALIGN_ICONS[currentAlign];

	const onToggleAlign = () => {
		const aligns = ["left", "center", "right"];
		if (!block) return;

		const nextAlign = aligns[
			(aligns.indexOf(currentAlign) + 1) % aligns.length
		] as YooptaBlockData["meta"]["align"];
		Blocks.updateBlock(editor, block.id, {
			meta: { ...block.meta, align: nextAlign },
		});
	};

	return (
		<ExtendedBlockActions
			onClick={() => editor.setPath({ current: block.meta.order })}
		>
			<BlockOptionsSeparator />
			<BlockOptionsMenuGroup>
				<BlockOptionsMenuItem>
					<button
						className="yoopta-block-options-button"
						onClick={onToggleAlign}
						type="button"
					>
						<AlignIcon className="mr-2 size-4" height={16} width={16} />
						Alignment
					</button>
				</BlockOptionsMenuItem>
				<BlockOptionsMenuItem>
					<button
						className="yoopta-block-options-button"
						onClick={onOpen}
						type="button"
					>
						<ExternalLink className="mr-2 size-4" height={16} width={16} />
						Open
					</button>
				</BlockOptionsMenuItem>
			</BlockOptionsMenuGroup>
		</ExtendedBlockActions>
	);
};

export { FileBlockOptions };
