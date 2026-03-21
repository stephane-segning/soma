import type { JSONContent } from "@soma/editor";

const UNTITLED_PAGE_TITLE = "Untitled";

function normalizePageTitle(title: string | null | undefined): string {
	const normalized = title?.trim();
	return normalized && normalized.length > 0 ? normalized : UNTITLED_PAGE_TITLE;
}

function isDefaultPageTitle(title: string | null | undefined): boolean {
	return normalizePageTitle(title) === UNTITLED_PAGE_TITLE;
}

function extractPlainText(node: JSONContent | undefined): string {
	if (!node) return "";
	if (node.type === "text" && typeof node.text === "string") return node.text;
	if (node.type === "hardBreak") return "\n";
	if (!Array.isArray(node.content) || node.content.length === 0) return "";
	return node.content.map((child) => extractPlainText(child)).join("");
}

function deriveTitleFromDocument(content: JSONContent | undefined): string {
	if (!content || !Array.isArray(content.content)) return UNTITLED_PAGE_TITLE;

	for (const block of content.content) {
		const firstLine = extractPlainText(block).split(/\r?\n/, 1)[0]?.replace(/\s+/g, " ").trim();
		if (firstLine) return firstLine.slice(0, 160);
	}

	return UNTITLED_PAGE_TITLE;
}

function shouldSyncDerivedTitle(input: {
	currentPageTitle: string | null | undefined;
	lastSyncedTitle: string | null;
	nextDerivedTitle: string;
}): boolean {
	const currentPageTitle = normalizePageTitle(input.currentPageTitle);
	const lastSyncedTitle = input.lastSyncedTitle ? normalizePageTitle(input.lastSyncedTitle) : null;
	const nextDerivedTitle = normalizePageTitle(input.nextDerivedTitle);

	if (currentPageTitle === nextDerivedTitle) return false;
	if (lastSyncedTitle) return currentPageTitle === lastSyncedTitle;
	return isDefaultPageTitle(currentPageTitle);
}

export {
	UNTITLED_PAGE_TITLE,
	deriveTitleFromDocument,
	extractPlainText,
	isDefaultPageTitle,
	normalizePageTitle,
	shouldSyncDerivedTitle,
};
