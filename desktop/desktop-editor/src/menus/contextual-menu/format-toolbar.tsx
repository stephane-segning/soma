import { cn } from "@soma/ui/utils/cn";
import type { Editor } from "@tiptap/react";
import type { ReactNode } from "react";
import { Bold, Italic, Minus, RefreshCw, Zap } from "react-feather";

type FormatToolbarProps = {
	editor: Editor;
	onQuickActions?: () => void;
	onRotate: () => void;
	panelOpen: boolean;
	rotateLabel: string;
};

export function FormatToolbar({ editor, onQuickActions, onRotate, panelOpen, rotateLabel }: FormatToolbarProps) {
	return (
		<div className="join">
			<ToggleButton active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}>
				<Bold className="size-4" />
			</ToggleButton>
			<ToggleButton active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}>
				<Italic className="size-4" />
			</ToggleButton>
			<ToggleButton active={editor.isActive("strike")} onClick={() => editor.chain().focus().toggleStrike().run()}>
				<Minus className="size-4" />
			</ToggleButton>
			<MouseDownButton title={rotateLabel} onMouseDown={onRotate}>
				<RefreshCw className="size-4" />
			</MouseDownButton>
			{onQuickActions ? (
				<MouseDownButton active={panelOpen} title="Quick actions" onMouseDown={onQuickActions}>
					<Zap className="size-4" />
				</MouseDownButton>
			) : null}
		</div>
	);
}

function ToggleButton({ active, children, onClick }: { active: boolean; children: ReactNode; onClick: () => void }) {
	return (
		<button type="button" onClick={onClick} className={cn("join-item btn btn-soft btn-sm btn-circle", active && "is-active")}>
			{children}
		</button>
	);
}

function MouseDownButton({ active, children, onMouseDown, title }: { active?: boolean; children: ReactNode; onMouseDown: () => void; title: string }) {
	return (
		<button
			type="button"
			onMouseDown={(event) => {
				event.preventDefault();
				event.stopPropagation();
				onMouseDown();
			}}
			className={cn("join-item btn btn-soft btn-sm btn-circle", active && "btn-active")}
			title={title}
		>
			{children}
		</button>
	);
}
