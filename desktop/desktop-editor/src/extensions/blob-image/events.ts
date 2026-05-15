export function extractImageFiles(event: ClipboardEvent | DragEvent): File[] {
	const dataTransfer = "clipboardData" in event ? event.clipboardData : event.dataTransfer;
	if (!dataTransfer?.files || dataTransfer.files.length === 0) return [];
	return Array.from(dataTransfer.files).filter((file) => file.type.startsWith("image/"));
}
