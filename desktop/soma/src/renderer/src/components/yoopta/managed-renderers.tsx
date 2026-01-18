import { cn } from "@renderer/lib/cn";
import type { CalloutTheme } from "@yoopta/callout/dist/types";
import type { PluginElementRenderProps } from "@yoopta/editor/dist/plugins/types";
import { cva } from "class-variance-authority";
import type React from "react";
import { memo } from "react";
import { Info } from "react-feather";

function toCssSize(
	value?: number | string | null,
	defaultValue = "100%",
): string {
	if (typeof value === "number") return `${value}px`;
	if (typeof value === "string" && value.trim().length > 0) return value;
	return defaultValue;
}

const imageWrapperClasses = cva(
	"yoopta-image-renderer inline-flex w-full justify-center",
);
const imageClasses = cva(
	"max-w-full rounded-lg bg-transparent object-contain transition duration-150 ease-in-out",
);

const fileRootClasses = cva(
	"yoopta-file-renderer flex items-center gap-3 rounded-lg bg-base-100 px-3 py-2 font-normal text-sm shadow-sm ring-1 ring-slate-200 ring-inset transition duration-150 ease-in-out",
);
const fileLinkClasses = cva("font-semibold text-primary");
const fileSizeClasses = cva("text-slate-500 text-xs");
const paragraphClasses = cva(
	"yoopta-paragraph whitespace-pre-wrap break-words text-base leading-7 tracking-normal",
);
const headingOneClasses = cva(
	"yoopta-heading-one pb-2 font-semibold text-3xl tracking-tight",
);
const headingTwoClasses = cva(
	"yoopta-heading-two pb-1 font-semibold text-2xl tracking-tight",
);
const headingThreeClasses = cva(
	"yoopta-heading-three font-semibold text-xl tracking-tight",
);
const blockquoteClasses = cva("w-full bg-base-200 px-2", {
	variants: {},
	defaultVariants: {},
});
const calloutClasses = cva("alert", {
	variants: {
		severity: {
			default: "alert-info",
			info: "alert-info",
			success: "alert-success",
			warning: "alert-warning",
			error: "alert-error",
		},
	},
	defaultVariants: {
		severity: "default",
	},
});
const tableWrapperClasses = cva(
	"yoopta-table-wrapper overflow-x-auto rounded-lg border border-base-200 bg-base-100 p-2",
);
const tableClasses = cva("table-zebra table w-full");
const tableRowClasses = cva("yoopta-table-row");
const tableCellClasses = cva("yoopta-table-cell align-top");
const accordionClasses = cva("yoopta-accordion rounded-box bg-base-200 p-4");
const codeBlockClasses = cva(
	"yoopta-code mockup-code overflow-auto bg-base-200 text-sm leading-6",
);
const listItemClasses = cva("yoopta-list-item flex gap-2");
const listBulletClasses = cva("yoopta-list-bullet mt-1 text-base-content");
const todoWrapperClasses = cva("yoopta-todo flex items-start gap-2");
const todoCheckboxClasses = cva("checkbox checkbox-sm mt-1");
const linkClasses = cva("yoopta-link link link-primary");
const embedWrapperClasses = cva(
	"yoopta-embed card overflow-hidden border border-base-300 bg-base-200 shadow-sm",
);
const embedBodyClasses = cva("card-body gap-2");

function BaseImage({
	attributes,
	children,
	element,
}: PluginElementRenderProps): React.JSX.Element {
	const { src, alt, sizes, fit, bgColor } = element.props || {};
	const width = toCssSize(sizes?.width);
	const height = toCssSize(sizes?.height, "auto");

	return (
		<div
			{...attributes}
			className={cn(imageWrapperClasses())}
			contentEditable={false}
		>
			<img
				alt={alt ?? ""}
				className={imageClasses()}
				decoding="async"
				loading="lazy"
				src={src ?? ""}
				style={{
					width,
					height,
					objectFit: fit ?? "contain",
					backgroundColor: bgColor ?? "transparent",
				}}
			/>
			{children}
		</div>
	);
}

const ManagedImage = memo(BaseImage);
ManagedImage.displayName = "ManagedImage";

function BaseFile({
	attributes,
	children,
	element,
}: PluginElementRenderProps): React.JSX.Element {
	const { src, name, size, format } = element.props || {};
	const label = name || format || "file";
	const sizeLabel =
		typeof size === "number" ? ` · ${(size / 1024).toFixed(1)} KB` : "";

	return (
		<div
			{...attributes}
			className={cn(fileRootClasses())}
			contentEditable={false}
		>
			<a
				className={fileLinkClasses()}
				href={src ?? ""}
				rel="noreferrer"
				target="_blank"
			>
				{label}
			</a>
			<span className={fileSizeClasses()}>{sizeLabel}</span>
			{children}
		</div>
	);
}

const ManagedFile = memo(BaseFile);
ManagedFile.displayName = "ManagedFile";

function BaseParagraph({
	attributes,
	children,
}: PluginElementRenderProps): React.JSX.Element {
	return (
		<p {...attributes} className={cn(paragraphClasses())}>
			{children}
		</p>
	);
}

const ManagedParagraph = memo(BaseParagraph);
ManagedParagraph.displayName = "ManagedParagraph";

function BaseHeadingOne({
	attributes,
	children,
}: PluginElementRenderProps): React.JSX.Element {
	return (
		<h1 {...attributes} className={cn(headingOneClasses())}>
			{children}
		</h1>
	);
}

const ManagedHeadingOne = memo(BaseHeadingOne);
ManagedHeadingOne.displayName = "ManagedHeadingOne";

function BaseHeadingTwo({
	attributes,
	children,
}: PluginElementRenderProps): React.JSX.Element {
	return (
		<h2 {...attributes} className={cn(headingTwoClasses())}>
			{children}
		</h2>
	);
}

const ManagedHeadingTwo = memo(BaseHeadingTwo);
ManagedHeadingTwo.displayName = "ManagedHeadingTwo";

function BaseHeadingThree({
	attributes,
	children,
}: PluginElementRenderProps): React.JSX.Element {
	return (
		<h3 {...attributes} className={cn(headingThreeClasses())}>
			{children}
		</h3>
	);
}

const ManagedHeadingThree = memo(BaseHeadingThree);
ManagedHeadingThree.displayName = "ManagedHeadingThree";

function BaseBlockquote({
	attributes,
	children,
}: PluginElementRenderProps): React.JSX.Element {
	return (
		<blockquote {...attributes} className={cn(blockquoteClasses({}))}>
			<pre>{children}</pre>
		</blockquote>
	);
}

const ManagedBlockquote = memo(BaseBlockquote);
ManagedBlockquote.displayName = "ManagedBlockquote";

function BaseCallout({
	attributes,
	children,
	element,
}: PluginElementRenderProps): React.JSX.Element {
	const theme = (element.props as { theme?: CalloutTheme })?.theme ?? "default";

	return (
		<div
			{...attributes}
			className={cn(calloutClasses({ severity: theme ?? "default" }))}
			role="note"
		>
			<Info className="h-6 w-6 shrink-0 stroke-current" />
			{children}
		</div>
	);
}

const ManagedCallout = memo(BaseCallout);
ManagedCallout.displayName = "ManagedCallout";

function BaseTable({
	attributes,
	children,
}: PluginElementRenderProps): React.JSX.Element {
	return (
		<div {...attributes} className={cn(tableWrapperClasses())}>
			<table className={cn(tableClasses())}>
				<tbody>{children}</tbody>
			</table>
		</div>
	);
}

const ManagedTable = memo(BaseTable);
ManagedTable.displayName = "ManagedTable";

function BaseTableRow({
	attributes,
	children,
}: PluginElementRenderProps): React.JSX.Element {
	return (
		<tr {...attributes} className={cn(tableRowClasses())}>
			{children}
		</tr>
	);
}

const ManagedTableRow = memo(BaseTableRow);
ManagedTableRow.displayName = "ManagedTableRow";

function BaseTableCell({
	attributes,
	children,
}: PluginElementRenderProps): React.JSX.Element {
	return (
		<td {...attributes} className={cn(tableCellClasses())}>
			{children}
		</td>
	);
}

const ManagedTableCell = memo(BaseTableCell);
ManagedTableCell.displayName = "ManagedTableCell";

function BaseAccordion({
	attributes,
	children,
}: PluginElementRenderProps): React.JSX.Element {
	return (
		<div {...attributes} className={cn(accordionClasses())}>
			{children}
		</div>
	);
}

const ManagedAccordion = memo(BaseAccordion);
ManagedAccordion.displayName = "ManagedAccordion";

function BaseNumberedList({
	attributes,
	children,
}: PluginElementRenderProps): React.JSX.Element {
	return (
		<ol
			{...attributes}
			className="yoopta-numbered-list list-decimal space-y-1 pl-6"
		>
			<li className={cn(listItemClasses())}>{children}</li>
		</ol>
	);
}

const ManagedNumberedList = memo(BaseNumberedList);
ManagedNumberedList.displayName = "ManagedNumberedList";

function BaseBulletedList({
	attributes,
	children,
}: PluginElementRenderProps): React.JSX.Element {
	return (
		<ul
			{...attributes}
			className="yoopta-bulleted-list list-disc space-y-1 pl-6"
		>
			<li className={cn(listItemClasses())}>
				<span className={cn(listBulletClasses())}>•</span>
				<div>{children}</div>
			</li>
		</ul>
	);
}

const ManagedBulletedList = memo(BaseBulletedList);
ManagedBulletedList.displayName = "ManagedBulletedList";

function BaseTodoList({
	attributes,
	children,
	element,
}: PluginElementRenderProps): React.JSX.Element {
	const checked = Boolean((element.props as { checked?: boolean })?.checked);

	return (
		<div
			{...attributes}
			className={cn(todoWrapperClasses())}
			data-checked={checked}
		>
			<input
				checked={checked}
				className={cn(todoCheckboxClasses())}
				readOnly
				tabIndex={-1}
				type="checkbox"
			/>
			<div className={checked ? "line-through opacity-70" : undefined}>
				{children}
			</div>
		</div>
	);
}

const ManagedTodoList = memo(BaseTodoList);
ManagedTodoList.displayName = "ManagedTodoList";

function BaseCode({
	attributes,
	children,
}: PluginElementRenderProps): React.JSX.Element {
	return (
		<pre {...attributes} className={cn(codeBlockClasses())}>
			<code>{children}</code>
		</pre>
	);
}

const ManagedCode = memo(BaseCode);
ManagedCode.displayName = "ManagedCode";

function BaseLink({
	attributes,
	children,
	element,
}: PluginElementRenderProps): React.JSX.Element {
	const href =
		(element.props as { url?: string; href?: string })?.url ??
		element.props?.href;

	return (
		<a
			{...attributes}
			className={cn(linkClasses())}
			href={href ?? ""}
			rel="noreferrer"
			target="_blank"
		>
			{children}
		</a>
	);
}

const ManagedLink = memo(BaseLink);
ManagedLink.displayName = "ManagedLink";

function BaseEmbed({
	attributes,
	children,
	element,
}: PluginElementRenderProps): React.JSX.Element {
	const src =
		(element.props as { url?: string; src?: string })?.url ??
		element.props?.src;

	return (
		<div {...attributes} className={cn(embedWrapperClasses())}>
			<div className={cn(embedBodyClasses())}>
				{src && (
					<a
						className="link link-primary"
						href={src}
						rel="noreferrer"
						target="_blank"
					>
						{src}
					</a>
				)}
				<div>{children}</div>
			</div>
		</div>
	);
}

const ManagedEmbed = memo(BaseEmbed);
ManagedEmbed.displayName = "ManagedEmbed";

const renderManagedImage = (props: PluginElementRenderProps) => (
	<ManagedImage {...props} />
);

const renderManagedFile = (props: PluginElementRenderProps) => (
	<ManagedFile {...props} />
);
const renderManagedParagraph = (props: PluginElementRenderProps) => (
	<ManagedParagraph {...props} />
);
const renderManagedHeadingOne = (props: PluginElementRenderProps) => (
	<ManagedHeadingOne {...props} />
);
const renderManagedHeadingTwo = (props: PluginElementRenderProps) => (
	<ManagedHeadingTwo {...props} />
);
const renderManagedHeadingThree = (props: PluginElementRenderProps) => (
	<ManagedHeadingThree {...props} />
);
const renderManagedBlockquote = (props: PluginElementRenderProps) => (
	<ManagedBlockquote {...props} />
);
const renderManagedCallout = (props: PluginElementRenderProps) => (
	<ManagedCallout {...props} />
);
const renderManagedTable = (props: PluginElementRenderProps) => (
	<ManagedTable {...props} />
);
const renderManagedTableRow = (props: PluginElementRenderProps) => (
	<ManagedTableRow {...props} />
);
const renderManagedTableCell = (props: PluginElementRenderProps) => (
	<ManagedTableCell {...props} />
);
const renderManagedAccordion = (props: PluginElementRenderProps) => (
	<ManagedAccordion {...props} />
);
const renderManagedNumberedList = (props: PluginElementRenderProps) => (
	<ManagedNumberedList {...props} />
);
const renderManagedBulletedList = (props: PluginElementRenderProps) => (
	<ManagedBulletedList {...props} />
);
const renderManagedTodoList = (props: PluginElementRenderProps) => (
	<ManagedTodoList {...props} />
);
const renderManagedCode = (props: PluginElementRenderProps) => (
	<ManagedCode {...props} />
);
const renderManagedLink = (props: PluginElementRenderProps) => (
	<ManagedLink {...props} />
);
const renderManagedEmbed = (props: PluginElementRenderProps) => (
	<ManagedEmbed {...props} />
);

export {
	renderManagedFile,
	renderManagedImage,
	renderManagedParagraph,
	renderManagedHeadingOne,
	renderManagedHeadingTwo,
	renderManagedHeadingThree,
	renderManagedBlockquote,
	renderManagedCallout,
	renderManagedTable,
	renderManagedTableRow,
	renderManagedTableCell,
	renderManagedAccordion,
	renderManagedNumberedList,
	renderManagedBulletedList,
	renderManagedTodoList,
	renderManagedCode,
	renderManagedLink,
	renderManagedEmbed,
};
