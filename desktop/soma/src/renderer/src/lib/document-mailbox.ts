type MailboxEntry = {
	contentJson: string | null;
	title?: string | null;
	updatedAtMs: number;
};

function mailboxKey(spaceId: string, pageId: string): string {
	return `soma:mailbox:${spaceId}:${pageId}`;
}

function readMailbox(spaceId: string, pageId: string): MailboxEntry | null {
	if (typeof window === "undefined" || !window.localStorage) return null;
	try {
		const raw = window.localStorage.getItem(mailboxKey(spaceId, pageId));
		if (!raw) return null;
		const parsed = JSON.parse(raw) as Partial<MailboxEntry>;
		if (typeof parsed !== "object" || parsed === null || typeof parsed.updatedAtMs !== "number") {
			return null;
		}
		return {
			contentJson: typeof parsed.contentJson === "string" ? parsed.contentJson : null,
			title: typeof parsed.title === "string" || parsed.title === null ? parsed.title : undefined,
			updatedAtMs: parsed.updatedAtMs,
		};
	} catch {
		return null;
	}
}

function writeMailbox(spaceId: string, pageId: string, entry: MailboxEntry): void {
	if (typeof window === "undefined" || !window.localStorage) return;
	try {
		window.localStorage.setItem(mailboxKey(spaceId, pageId), JSON.stringify(entry));
	} catch {
		// ignore localStorage write failures
	}
}

export type { MailboxEntry };
export { mailboxKey, readMailbox, writeMailbox };
