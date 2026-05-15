import type { RefObject } from "react";

type RenameInlineEditorProps = {
	draftTitle: string;
	inputRef: RefObject<HTMLInputElement | null>;
	isRenaming: boolean;
	onCancel: () => void;
	onChange: (value: string) => void;
	onRename: () => void;
};

export function RenameInlineEditor({
	draftTitle,
	inputRef,
	isRenaming,
	onCancel,
	onChange,
	onRename,
}: RenameInlineEditorProps) {
	if (!isRenaming) return null;

	return (
		<div className="mt-2 rounded-lg border border-base-300 bg-base-100 px-3 py-2">
			<input
				ref={inputRef}
				className="input input-bordered input-sm w-full"
				value={draftTitle}
				onBlur={() => onRename()}
				onChange={(event) => onChange(event.target.value)}
				onKeyDown={(event) => {
					if (event.key === "Escape") {
						event.preventDefault();
						onCancel();
					}
					if (event.key === "Enter") {
						event.preventDefault();
						onRename();
					}
				}}
			/>
		</div>
	);
}
