import YooptaEditor, { type YooptaEditorProps } from "@yoopta/editor";

type Props = Pick<
	YooptaEditorProps,
	"editor" | "plugins" | "marks" | "value" | "placeholder" | "readOnly" | "className" | "style" | "tools" | "onChange"
>;

function YooptaEditorView({
	editor,
	plugins,
	marks,
	value,
	placeholder,
	readOnly,
	className,
	style,
	tools,
	onChange,
}: Props): React.JSX.Element {
	const maybeValueProps =
		value === undefined
			? {}
			: {
					value,
				};
	return (
		<YooptaEditor
			autoFocus
			className={className}
			editor={editor}
			marks={marks}
			onChange={onChange}
			placeholder={placeholder}
			plugins={plugins}
			readOnly={readOnly}
			style={style}
			tools={tools}
			{...maybeValueProps}
		/>
	);
}

export { YooptaEditorView };
