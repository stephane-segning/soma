import { convertFileSrc } from "@tauri-apps/api/core";
import { basename, extname } from "@tauri-apps/api/path";
import { open, type OpenDialogOptions } from "@tauri-apps/plugin-dialog";

type PickFileOptions = {
	accept?: string;
};

const MIME_BY_EXT: Record<string, string> = {
	avif: "image/avif",
	bmp: "image/bmp",
	gif: "image/gif",
	jpeg: "image/jpeg",
	jpg: "image/jpeg",
	png: "image/png",
	svg: "image/svg+xml",
	webp: "image/webp",
	heic: "image/heic",
	mp4: "video/mp4",
	webm: "video/webm",
	mov: "video/quicktime",
	mkv: "video/x-matroska",
	avi: "video/x-msvideo",
	mpeg: "video/mpeg",
	mpg: "video/mpeg",
	pdf: "application/pdf",
	txt: "text/plain",
	md: "text/markdown",
	json: "application/json",
	doc: "application/msword",
	docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
	xls: "application/vnd.ms-excel",
	xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
	csv: "text/csv",
};

const IMAGE_EXTS = [
	"png",
	"jpg",
	"jpeg",
	"gif",
	"webp",
	"avif",
	"bmp",
	"svg",
	"heic",
];
const VIDEO_EXTS = ["mp4", "mov", "webm", "mkv", "avi", "mpeg", "mpg"];

function parseAcceptExtensions(accept?: string): string[] {
	if (!accept) return [];

	return accept
		.split(",")
		.map((token) => token.trim())
		.flatMap((token) => {
			if (token === "image/*") return IMAGE_EXTS;
			if (token === "video/*") return VIDEO_EXTS;
			if (token.startsWith(".")) return [token.slice(1)];
			const [, subtype] = token.split("/");
			if (subtype && subtype !== "*") return [subtype];
			return [];
		})
		.filter(Boolean)
		.map((ext) => ext.toLowerCase());
}

function acceptToFilters(accept?: string): OpenDialogOptions["filters"] {
	const extensions = parseAcceptExtensions(accept);
	if (extensions.length === 0) return undefined;
	return [
		{
			name: "Files",
			extensions,
		},
	];
}

function guessMimeFromExt(ext: string | null | undefined, accept?: string): string {
	if (!ext) return accept?.startsWith("image/") ? "image/*" : "application/octet-stream";
	const cleanExt = ext.replace(/^\./, "").toLowerCase();
	return MIME_BY_EXT[cleanExt] || "application/octet-stream";
}

export async function pickSingleFile(options: PickFileOptions = {}): Promise<File | null> {
	if (typeof window === "undefined") return null;

	const accept = options.accept;
	const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

	if (isTauri) {
		try {
			const selection = await open({
				multiple: false,
				filters: acceptToFilters(accept),
			});

			const selectedPath = Array.isArray(selection) ? selection[0] : selection;
			if (!selectedPath) return null;

			const [name, extension] = await Promise.all([
				basename(selectedPath),
				extname(selectedPath),
			]);

			const mime = guessMimeFromExt(extension, accept);
			const assetUrl = convertFileSrc(selectedPath);
			const response = await fetch(assetUrl);
			if (!response.ok) {
				throw new Error(`Failed to read file bytes for ${selectedPath}`);
			}
			const buffer = await response.arrayBuffer();
			const bytes = new Uint8Array(buffer);

			return new File([bytes], name, {
				type: mime,
				lastModified: Date.now(),
			});
		} catch (error) {
			console.warn("Tauri dialog picker failed, falling back to DOM file input", error);
		}
	}

	return new Promise((resolve) => {
		const input = document.createElement("input");
		input.type = "file";
		input.accept = accept || "";
		input.multiple = false;
		input.style.position = "fixed";
		input.style.left = "-10000px";
		input.style.top = "-10000px";
		input.onchange = () => {
			const file = input.files?.[0];
			resolve(file ?? null);
			input.remove();
		};
		document.body.appendChild(input);
		input.click();
	});
}
