type SpaceMemberLike = {
	peerId: string;
	role: string;
	expiresAt: number;
};

type RoleOption = {
	value: string;
	label: string;
	description: string;
	warning?: string;
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

function describeRole(role: string | null | undefined): string {
	switch ((role ?? "").trim().toLowerCase()) {
		case "owner":
			return "Full workspace control, including access and settings.";
		case "editor":
			return "Can create and edit workspace content.";
		case "viewer":
			return "Can open and read content, but should not edit.";
		case "member":
			return "General workspace access when you do not want a more specific role yet.";
		case "bot":
			return "Non-human workspace member. Depending on delegated capabilities, a bot may cache and serve content, organize and index content, or run approved automation and scripts. Bot membership alone does not grant approval authority.";
		default:
			return "Role details are not available.";
	}
}

function roleOptions(): RoleOption[] {
	return [
		{
			value: "editor",
			label: "Editor",
			description: describeRole("editor"),
		},
		{
			value: "viewer",
			label: "Viewer",
			description: describeRole("viewer"),
		},
		{
			value: "member",
			label: "Member",
			description: describeRole("member"),
		},
		{
			value: "owner",
			label: "Owner",
			description: describeRole("owner"),
			warning: "Use sparingly. This grants full workspace control.",
		},
		{
			value: "bot",
			label: "Bot",
			description: describeRole("bot"),
			warning: "Use only for trusted non-human peers. Approval authority must be delegated separately.",
		},
	];
}

function requestedAccessLevelLabel(role: number): string {
	switch (role) {
		case 1:
			return "Owner";
		case 2:
			return "Editor";
		case 3:
			return "Viewer";
		case 4:
			return "Member";
		case 5:
			return "Bot";
		default:
			return "Member";
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

export { describeRole, formatRoleLabel, membershipSummary, requestedAccessLevelLabel, roleOptions };
export type { RoleOption };
