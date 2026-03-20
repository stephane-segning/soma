import { type Editor, useEditorState } from "@tiptap/react";

export function LimitPercentage({
	editor,
	limit,
}: {
	editor: Editor;
	limit: number;
}) {
	const { characterCount } = useEditorState({
		editor,
		selector: (ctx) => {
			return {
				characterCount: ctx.editor.storage.characterCount.characters(),
			};
		},
	});

	const percentage = editor ? Math.round((100 / limit) * characterCount) : 0;

	return (
		<div className="flex items-center gap-4 pt-24">
			<div
				className="radial-progress text-primary"
				style={{
					// @ts-expect-error
					"--value": percentage,
					"--size": "24px",
					"--thickness": "4px",
				}}
				aria-valuenow={percentage}
				role="progressbar"
			/>
			{editor.storage.characterCount.characters()} / {limit} characters
		</div>
	);
}
