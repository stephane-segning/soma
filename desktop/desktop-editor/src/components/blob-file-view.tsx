import type { NodeViewProps } from "@tiptap/core";
import { NodeViewWrapper } from "@tiptap/react";

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

export function BlobFileView({ node }: NodeViewProps): React.JSX.Element {
	const href = node.attrs.href as string | undefined;
	const name = (node.attrs.name as string | undefined) ?? "Untitled file";
	const size = node.attrs.size as number | undefined;

	return (
		<NodeViewWrapper as="div" className="my-2" contentEditable={false}>
			<a
				href={href}
				className="flex items-center justify-between gap-3 rounded-lg border border-base-300 bg-base-100 px-3 py-2 text-sm shadow-sm"
				rel="noreferrer"
				target="_blank"
			>
				<div className="min-w-0 truncate">{name}</div>
				<div className="shrink-0 text-xs text-base-content/60">{href ? formatBytes(size) : "Uploading..."}</div>
			</a>
		</NodeViewWrapper>
	);
}

