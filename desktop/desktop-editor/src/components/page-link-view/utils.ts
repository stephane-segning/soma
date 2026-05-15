export function formatLinkLabel(href: string): string {
	try {
		if (href.startsWith("/") || href.startsWith("#")) return href;
		const url = new URL(href, "https://example.com");
		const host = url.hostname.replace(/^www\./, "");
		const path = url.pathname === "/" ? "" : url.pathname;
		return `${host}${path}`;
	} catch {
		return href;
	}
}

export function getPageLinkOptions(options: unknown) {
	const raw = (options ?? {}) as {
		onOpen?: (pageId: string, title?: string, href?: string) => void;
		onRename?: (pageId: string, nextTitle: string, currentTitle?: string) => string | null | Promise<string | null>;
	};
	return {
		onOpenPage: raw.onOpen,
		onRenamePage: raw.onRename,
	};
}
