import type { NodeViewProps } from "@tiptap/core";
import { NodeViewWrapper } from "@tiptap/react";

function formatMimeLabel(mime: string | undefined): string {
	if (!mime) return "File";
	if (mime === "application/zip") return "ZIP archive";
	return mime.split("/").pop()?.toUpperCase() || "File";
}

function formatBytes(bytes: number | undefined): string {
	if (!bytes || bytes <= 0) return "";
	const units = ["B", "KB", "MB", "GB"];
	let value = bytes;
	let unit = 0;
	while (value >= 1024 && unit < units.length - 1) {
		value /= 1024;
		unit++;
	}
	return `${value.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}

export function BlobFileView({ node, deleteNode }: NodeViewProps): React.JSX.Element {
	const href = node.attrs.href as string | undefined;
	const name = (node.attrs.originalName as string | undefined) ?? (node.attrs.name as string | undefined) ?? "Untitled file";
	const storedName = node.attrs.name as string | undefined;
	const mime = (node.attrs.originalMime as string | undefined) ?? (node.attrs.mime as string | undefined);
	const size = (node.attrs.originalSize as number | undefined) ?? (node.attrs.size as number | undefined);
	const error = node.attrs.error as string | undefined;
	const isUploading = !href && !error;
	const isArchived = href && mime !== node.attrs.mime;

	return (
		<NodeViewWrapper as="div" className="my-2" contentEditable={false}>
			<div className="rounded-xl border border-base-300 bg-base-100 px-4 py-3 shadow-sm">
				<div className="flex items-start justify-between gap-3">
					<div className="min-w-0 space-y-1">
						<div className="truncate font-medium text-sm">{name}</div>
						<div className="flex flex-wrap items-center gap-2 text-base-content/60 text-xs">
							<span className="badge badge-outline badge-xs">{formatMimeLabel(mime)}</span>
							{size ? <span>{formatBytes(size)}</span> : null}
							{isArchived && storedName ? <span>Stored as {storedName}</span> : null}
						</div>
						{error ? <div className="text-error text-xs">Upload failed: {error}</div> : null}
						{isUploading ? <div className="text-base-content/60 text-xs">Uploading attachment...</div> : null}
					</div>
					<div className="flex shrink-0 items-center gap-2">
						{href ? (
							<a className="btn btn-ghost btn-xs" href={href} rel="noreferrer" target="_blank">
								Open
							</a>
						) : null}
						{error ? (
							<button className="btn btn-ghost btn-xs" onClick={() => deleteNode()} type="button">
								Remove
							</button>
						) : null}
					</div>
				</div>
			</div>
		</NodeViewWrapper>
	);
}
