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
const videoWrapperClasses = cva(
	"yoopta-video-renderer inline-flex w-full justify-center",
);
const videoClasses = cva("max-w-full rounded-lg shadow-inner");
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

function BaseVideo({
	attributes,
	children,
	element,
}: PluginElementRenderProps): React.JSX.Element {
	const { src, poster, sizes, fit, bgColor } = element.props || {};
	const width = toCssSize(sizes?.width);
	const height = toCssSize(sizes?.height, "auto");

	return (
		<div
			{...attributes}
			className={cn(videoWrapperClasses())}
			contentEditable={false}
		>
			<video
				className={videoClasses()}
				controls
				poster={poster ?? undefined}
				src={src ?? ""}
				style={{
					width,
					height,
					objectFit: fit ?? "contain",
					backgroundColor: bgColor ?? "black",
				}}
			/>
			{children}
		</div>
	);
}

const ManagedVideo = memo(BaseVideo);
ManagedVideo.displayName = "ManagedVideo";

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

const renderManagedImage = (props: PluginElementRenderProps) => (
	<ManagedImage {...props} />
);
const renderManagedVideo = (props: PluginElementRenderProps) => (
	<ManagedVideo {...props} />
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

export {
	renderManagedFile,
	renderManagedImage,
	renderManagedVideo,
	renderManagedParagraph,
	renderManagedHeadingOne,
	renderManagedHeadingTwo,
	renderManagedHeadingThree,
	renderManagedBlockquote,
	renderManagedCallout,
};
