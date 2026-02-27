import { TanstackTable } from "@app/components/tables/tanstack-table";
import { useSpaceMembersQuery } from "@app/queries/spaces";
import type { ColumnDef } from "@tanstack/react-table";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router";

function Component(): React.JSX.Element {
	const { t } = useTranslation("common");
	const { spaceId } = useParams();
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
				header: "Peer",
				cell: ({ row }) => <span className="font-mono text-sm">{row.original.peerId}</span>,
			},
			{
				header: "Role",
				cell: ({ row }) => (
					<span className="badge badge-outline badge-sm uppercase">
						{row.original.role || t("space.members.roleUnknown", "unknown")}
					</span>
				),
			},
			{
				header: "Expiry",
				cell: ({ row }) => <span className="text-base-content/70 text-xs">{formatExpiry(row.original.expiresAt)}</span>,
			},
		],
		[formatExpiry, t],
	);

	return (
		<div className="space-y-4">
			<h2 className="font-semibold text-lg">{t("space.members.title", "Members")}</h2>
			<div className="rounded-lg border border-base-300 bg-base-100">
				<div className="border-base-300 border-b px-4 py-3 text-base-content/70 text-sm">
					{t("space.members.subtitle", "Roster and roles are pulled from the daemon.")}
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
						emptyMessage={t("space.members.empty", "No members found for this space.")}
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
