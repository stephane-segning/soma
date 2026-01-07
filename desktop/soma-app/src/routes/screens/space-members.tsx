import { useSpaceMembersQuery } from "@soma/queries/spaces";
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

	return (
		<div className="space-y-4">
			<h2 className="font-semibold text-lg">
				{t("space.members.title", "Members")}
			</h2>
			<div className="rounded-lg border border-base-300 bg-base-100">
				<div className="border-base-300 border-b px-4 py-3 text-base-content/70 text-sm">
					{t(
						"space.members.subtitle",
						"Roster and roles are pulled from the daemon.",
					)}
				</div>

				{membersQuery.isLoading && (
					<div className="space-y-2 p-4">
						<div className="skeleton h-10 w-full" />
						<div className="skeleton h-10 w-full" />
						<div className="skeleton h-10 w-5/6" />
					</div>
				)}

				{membersQuery.isError && (
					<div className="p-4 text-error">
						{t(
							"space.members.loadError",
							"Could not load members from the daemon.",
						)}
					</div>
				)}

				{!membersQuery.isLoading &&
					!membersQuery.isError &&
					members.length === 0 && (
						<div className="p-4 text-base-content/70">
							{t("space.members.empty", "No members found for this space.")}
						</div>
					)}

				{members.length > 0 && (
					<div className="divide-y divide-base-300">
						{members.map((member) => (
							<div
								className="flex items-center justify-between px-4 py-3"
								key={member.peerId}
							>
								<div className="space-y-1">
									<div className="font-mono text-base-content text-sm">
										{member.peerId}
									</div>
									<div className="text-base-content/60 text-xs">
										{formatExpiry(member.expiresAt)}
									</div>
								</div>
								<span className="badge badge-outline badge-sm uppercase">
									{member.role || t("space.members.roleUnknown", "unknown")}
								</span>
							</div>
						))}
					</div>
				)}
			</div>
		</div>
	);
}

export { Component };
