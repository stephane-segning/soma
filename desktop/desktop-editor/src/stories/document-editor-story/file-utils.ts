export function pickFile(accept: string): Promise<File | null> {
	return new Promise((resolve) => {
		const input = document.createElement("input");
		let settled = false;
		const cleanup = () => {
			if (settled) return;
			settled = true;
			window.removeEventListener("focus", onFocus, true);
			input.remove();
		};
		const onFocus = () => {
			setTimeout(() => {
				if (settled) return;
				if (input.files?.length) {
					resolve(input.files?.[0] ?? null);
					cleanup();
				}
			}, 0);
		};
		input.type = "file";
		input.accept = accept;
		input.onchange = () => {
			resolve(input.files?.[0] ?? null);
			cleanup();
		};
		window.addEventListener("focus", onFocus, true);
		input.click();
	});
}

export function loadImageDimensions(src: string): Promise<{ width: number; height: number } | null> {
	return new Promise((resolve) => {
		const image = new Image();
		image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
		image.onerror = () => resolve(null);
		image.src = src;
	});
}
