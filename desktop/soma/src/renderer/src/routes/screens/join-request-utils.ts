type JoinDraft = {
	spaceId: string;
	targetPeerId: string;
	targetMultiaddrs: string;
	displayName: string;
	deviceName: string;
};

function parseMultiaddrs(rawValue: string): string[] {
	const values = rawValue
		.split(/[\n,]/g)
		.map((value) => value.trim())
		.filter((value) => value.length > 0);
	return Array.from(new Set(values));
}

function validateJoinDraft(joinDraft: JoinDraft): string | null {
	if (!joinDraft.spaceId.trim()) {
		return "Add the space ID you were invited to.";
	}
	if (!joinDraft.targetPeerId.trim()) {
		return "Add the peer ID for the owner or delegated approver for this space.";
	}
	if (parseMultiaddrs(joinDraft.targetMultiaddrs).length === 0) {
		return "Add at least one network address so Soma knows where to send the request.";
	}
	return null;
}

export { parseMultiaddrs, validateJoinDraft };
export type { JoinDraft };
