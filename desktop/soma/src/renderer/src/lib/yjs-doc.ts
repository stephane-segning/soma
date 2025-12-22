import * as Y from "yjs";

type PageDocInitial = {
	title?: string;
	contentJson?: string | null;
	updatedAtMs?: number;
};

type PageSnapshot = {
	title: string;
	contentJson: string | null;
	updatedAtMs: number;
};

const docs = new Map<string, { doc: Y.Doc; initialized: boolean }>();

function pageDocKey(spaceId: string, pageId: string): string {
	return `${spaceId}:${pageId}`;
}

function getPageDoc(
	key: string,
	initial?: PageDocInitial,
	options?: { overwrite?: boolean },
): Y.Doc {
	const existing = docs.get(key);
	if (!existing) {
		const doc = new Y.Doc();
		applyInitial(doc, initial, options);
		docs.set(key, { doc, initialized: true });
		return doc;
	}

	const { doc, initialized } = existing;
	if (!initialized || options?.overwrite) {
		applyInitial(doc, initial, options);
		existing.initialized = true;
	}
	return doc;
}

function applyInitial(
	doc: Y.Doc,
	initial?: PageDocInitial,
	options?: { overwrite?: boolean },
): void {
	if (!initial) return;
	const map = doc.getMap("page");
	const overwrite = options?.overwrite ?? false;
	const hasContent = typeof map.get("contentJson") === "string";
	if (initial.contentJson !== undefined && (overwrite || !hasContent)) {
		map.set("contentJson", initial.contentJson);
	}
	const hasTitle = typeof map.get("title") === "string";
	if (initial.title && (overwrite || !hasTitle)) {
		map.set("title", initial.title);
	}
	if (initial.updatedAtMs && typeof initial.updatedAtMs === "number") {
		map.set("updatedAtMs", initial.updatedAtMs);
	}
}

function getPageSnapshot(doc: Y.Doc): PageSnapshot {
	const map = doc.getMap("page");
	const titleRaw = map.get("title");
	const contentRaw = map.get("contentJson");
	const updatedAtRaw = map.get("updatedAtMs");
	const title =
		typeof titleRaw === "string" && titleRaw.trim()
			? titleRaw
			: "Untitled page";
	const contentJson = typeof contentRaw === "string" ? contentRaw : null;
	const updatedAtMs =
		typeof updatedAtRaw === "number" ? updatedAtRaw : Date.now();

	return { title, contentJson, updatedAtMs };
}

function setPageContent(doc: Y.Doc, contentJson: string | null): void {
	const map = doc.getMap("page");
	map.set("contentJson", contentJson);
	map.set("updatedAtMs", Date.now());
}

function setPageTitle(doc: Y.Doc, title: string): void {
	const map = doc.getMap("page");
	map.set("title", title?.trim() || "Untitled page");
	map.set("updatedAtMs", Date.now());
}

export { getPageDoc, getPageSnapshot, pageDocKey, setPageContent, setPageTitle };
export type { PageSnapshot };
