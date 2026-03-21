type SpaceMemberLike = {
	peerId: string;
	role: string;
	expiresAt: number;
};

function formatRoleLabel(role: string | null | undefined): string {
	switch ((role ?? "").trim().toLowerCase()) {
		case "owner":
			return "Owner";
		case "editor":
			return "Editor";
		case "viewer":
			return "Viewer";
		case "member":
			return "Member";
		case "bot":
			return "Bot";
		default:
			return "Unknown";
	}
}

function membershipSummary(members: SpaceMemberLike[]): string {
	if (members.length === 0) return "No members yet";
	const owners = members.filter((member) => member.role === "owner").length;
	const bots = members.filter((member) => member.role === "bot").length;
	const expiring = members.filter((member) => member.expiresAt > 0).length;
	const parts = [`${members.length} member${members.length === 1 ? "" : "s"}`];
	if (owners > 0) parts.push(`${owners} owner${owners === 1 ? "" : "s"}`);
	if (bots > 0) parts.push(`${bots} bot${bots === 1 ? "" : "s"}`);
	if (expiring > 0) parts.push(`${expiring} expiring access grant${expiring === 1 ? "" : "s"}`);
	return parts.join(" - ");
}

export { formatRoleLabel, membershipSummary };
