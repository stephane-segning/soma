import type { PluginElementRenderProps } from "@yoopta/editor/dist/plugins/types";
import React, { memo } from "react";

function toCssSize(
	value?: number | string | null,
	defaultValue = "100%",
): string {
	if (typeof value === "number") return `${value}px`;
	if (typeof value === "string" && value.trim().length > 0) return value;
	return defaultValue;
}

const containerStyle: React.CSSProperties = {
	display: "inline-flex",
	width: "100%",
	justifyContent: "center",
};

const mediaStyle: React.CSSProperties = {
	borderRadius: 8,
	maxWidth: "100%",
};

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
			className="yoopta-image-renderer"
			contentEditable={false}
			style={containerStyle}
		>
			<img
				alt={alt ?? ""}
				decoding="async"
				loading="lazy"
				src={src ?? ""}
				style={{
					...mediaStyle,
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
			className="yoopta-video-renderer"
			contentEditable={false}
			style={containerStyle}
		>
			<video
				controls
				poster={poster ?? undefined}
				src={src ?? ""}
				style={{
					...mediaStyle,
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
			className="yoopta-file-renderer"
			contentEditable={false}
			style={{
				display: "flex",
				alignItems: "center",
				gap: 8,
				padding: "8px 12px",
				borderRadius: 8,
				background: "#f5f5f5",
			}}
		>
			<a
				href={src ?? ""}
				rel="noreferrer"
				style={{ color: "#0f62fe", fontWeight: 600 }}
				target="_blank"
			>
				{label}
			</a>
			<span style={{ color: "#555", fontSize: 12 }}>{sizeLabel}</span>
			{children}
		</div>
	);
}

const ManagedFile = memo(BaseFile);
ManagedFile.displayName = "ManagedFile";

const renderManagedImage = (props: PluginElementRenderProps) => <ManagedImage {...props} />;
const renderManagedVideo = (props: PluginElementRenderProps) => <ManagedVideo {...props} />;
const renderManagedFile = (props: PluginElementRenderProps) => <ManagedFile {...props} />;

export { renderManagedFile, renderManagedImage, renderManagedVideo };
