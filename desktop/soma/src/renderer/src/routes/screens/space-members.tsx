import { TanstackTable } from "@app/components/tables/tanstack-table";
import { useSpaceMembersQuery, useSpaceQuery } from "@app/queries/spaces";
import type { ColumnDef } from "@tanstack/react-table";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router";
import { describeRole, formatRoleLabel, membershipSummary } from "./access-utils";

function Component(): React.JSX.Element {
	const { t } = useTranslation("common");
	const { spaceId } = useParams();
	const spaceQuery = useSpaceQuery(spaceId ?? "");
	const membersQuery = useSpaceMembersQuery(spaceId ?? "");

	const members = membersQuery.data ?? [];

	const formatExpiry = useMemo(() => {
		const formatter = new Intl.DateTimeFormat(undefined, {
			year: "numeric",
			month: "short",
			day: "numeric",
			hour: "2-digit",
			minute: "2-digit",
		});
		return (expiresAt: number) => {
			if (!expiresAt || expiresAt <= 0) {
				return t("space.members.noExpiry", "No expiry");
			}
			const date = new Date(expiresAt * 1000);
			if (Number.isNaN(date.getTime())) {
				return t("space.members.noExpiry", "No expiry");
			}
			return formatter.format(date);
		};
	}, [t]);
	const columns = useMemo<ColumnDef<(typeof members)[number]>[]>(
		() => [
			{
				header: "Member",
				cell: ({ row }) => (
					<div>
						<div className="font-medium text-sm">
							{row.original.peerId === spaceQuery.data?.ownerPeerId ? "Owner device" : row.original.peerId}
						</div>
						<div className="font-mono text-base-content/60 text-xs">{row.original.peerId}</div>
					</div>
				),
			},
			{
				header: "Role",
				cell: ({ row }) => (
					<div className="space-y-1">
						<span className="badge badge-outline badge-sm">
							{formatRoleLabel(row.original.role || t("space.members.roleUnknown", "unknown"))}
						</span>
						<div className="max-w-xs text-base-content/60 text-xs">{describeRole(row.original.role)}</div>
					</div>
				),
			},
			{
				header: "Expiry",
				cell: ({ row }) => <span className="text-base-content/70 text-xs">{formatExpiry(row.original.expiresAt)}</span>,
			},
		],
		[formatExpiry, spaceQuery.data?.ownerPeerId, t],
	);

	return (
		<div className="space-y-4">
			<div className="space-y-2">
				<h2 className="font-semibold text-lg">{t("space.members.title", "Members")}</h2>
				<p className="text-base-content/70 text-sm">
					{spaceQuery.data?.displayName?.trim() || spaceId || "This space"} shows who currently has access and what role
					they hold.
				</p>
			</div>
			<div className="rounded-lg border border-base-300 bg-base-100">
				<div className="border-base-300 border-b px-4 py-3 text-sm">
					<div className="font-medium">{membershipSummary(members)}</div>
					<div className="mt-1 text-base-content/70">
						Use space settings to approve join requests or revoke access for a member.
					</div>
					<div className="mt-2 grid gap-2 text-base-content/60 text-xs md:grid-cols-2">
						<div>Owner manages access and settings. Editors can change content.</div>
						<div>
							Viewers are read-only. Members are general participants. Bot is a membership role only; approval authority
							must be delegated separately, and bot work should stay within keeping attachments available, organizing
							content, or approved automation.
						</div>
					</div>
					<div className="mt-3">
						<Link className="btn btn-ghost btn-xs" to={`/spaces/${spaceId}/settings`}>
							Open people and access settings
						</Link>
					</div>
				</div>

				{membersQuery.isError && (
					<div className="p-4 text-error">
						{t("space.members.loadError", "Could not load members from the daemon.")}
					</div>
				)}

				{!membersQuery.isError ? (
					<TanstackTable
						className="rounded-none border-0"
						columns={columns}
						data={members}
						emptyMessage={t("space.members.empty", "No one else has access to this space yet.")}
						getRowId={(row) => `${row.spaceId}:${row.peerId}`}
						isLoading={membersQuery.isLoading}
						loadingMessage={t("space.members.loading", "Loading members...")}
					/>
				) : null}
			</div>
		</div>
	);
}

export { Component };
