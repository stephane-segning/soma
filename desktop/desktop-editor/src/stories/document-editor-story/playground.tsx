import { createId } from "@paralleldrive/cuid2";
import { type BlobFileUploadResult, type BlobImageUploadResult, DocumentEditor } from "@soma/editor";
import { useCallback, useMemo } from "react";
import { createStoryCommands } from "./commands";
import { loadImageDimensions } from "./file-utils";
import { initialContent } from "./initial-content";

export function PlaygroundRender() {
	const uploadImage = useCallback(async (file: File): Promise<BlobImageUploadResult> => {
		const src = URL.createObjectURL(file);
		const dimensions = await loadImageDimensions(src);
		return {
			cid: createId(),
			src,
			mime: file.type || "application/octet-stream",
			size: file.size,
			name: file.name,
			width: dimensions?.width,
			height: dimensions?.height,
		};
	}, []);

	const uploadFile = useCallback(async (file: File): Promise<BlobFileUploadResult> => ({
		cid: createId(),
		href: URL.createObjectURL(file),
		mime: file.type || "application/octet-stream",
		size: file.size,
		name: file.name,
	}), []);

	const commands = useMemo(() => createStoryCommands({ uploadFile, uploadImage }), [uploadFile, uploadImage]);

	return (
		<div className="min-h-screen bg-base-100 px-4 md:px-16 lg:px-32 py-12">
			<DocumentEditor
				limit={20_000}
				commands={commands}
				initialContent={initialContent}
				onChange={() => {}}
				onOpenPageLink={(pageId) => {
					// eslint-disable-next-line no-alert
					alert(`Open page ${pageId} in new tab`);
				}}
				onRenamePageLink={async (_pageId, nextTitle) => nextTitle}
				placeholder="Start writing..."
				uploadFile={uploadFile}
				uploadImage={uploadImage}
			/>
		</div>
	);
}
