import { cn } from "@soma/ui/utils/cn";
import type { Editor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import { Bold, Italic, Minus } from "react-feather";

export function ContextualMenu({ editor }: { editor: Editor }) {
	return (
		<BubbleMenu className="bubble-menu" editor={editor}>
			<div className="join">
				<button
					type="button"
					onClick={() => editor.chain().focus().toggleBold().run()}
					className={cn(
						"join-item btn btn-soft btn-sm btn-circle",
						editor.isActive("bold") && "is-active",
					)}
				>
					<Bold className="size-4" />
				</button>
				<button
					type="button"
					onClick={() => editor.chain().focus().toggleItalic().run()}
					className={cn(
						"join-item btn btn-soft btn-sm btn-circle",
						editor.isActive("italic") && "is-active",
					)}
				>
					<Italic className="size-4" />
				</button>
				<button
					type="button"
					onClick={() => editor.chain().focus().toggleStrike().run()}
					className={cn(
						"join-item btn btn-soft btn-sm btn-circle",
						editor.isActive("strike") && "is-active",
					)}
				>
					<Minus className="size-4" />
				</button>
			</div>
		</BubbleMenu>
	);
}
