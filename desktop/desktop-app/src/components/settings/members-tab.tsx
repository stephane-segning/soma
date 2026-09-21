/**
 * MembersTab — `spaces/:spaceId/settings` "Members" tab body.
 *
 * Two sections:
 * - **Roster** — every `StoredSpaceMember`: role, expiry, a "you" marker
 *   (via `daemon.status().peerId`), and revoke behind an
 *   `InlineSlugConfirm` (ADR-0005 §3 — never one-click).
 * - **Pending join requests** — `spaces.joinRequests()` returns every
 *   pending request across every space (no per-space filter server-side),
 *   so this narrows to `spaceId` client-side via
 *   `filterJoinRequestsBySpace`. Approve/Reject are one-click: the
 *   subject isn't a member yet, so this isn't the same "destructive"
 *   class of action revoke is.
 *
 * Every primary action's failure renders inline in the row that caused
 * it (ADR-0005 §6) — no toast (the app doesn't mount one anyway).
 */
import type { DaemonStatus, StoredJoinRequest, StoredSpaceMember } from "@soma/sdk";
import { PolymorphButton } from "@soma/ui/components/actions/polymorph-button";
import { DenseRow } from "@soma/ui/components/lists/dense-row";
import { Empty } from "@soma/ui/components/primitives/empty";
import { Pill } from "@soma/ui/components/primitives/pill";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { backend } from "../../lib/backend";
import {
	describeExpiry,
	filterJoinRequestsBySpace,
	memberConfirmSlug,
	normalizeRoleSlug,
	roleSlugFromCode,
	truncatePeerId,
} from "../../lib/space-settings";
import { InlineSlugConfirm } from "./inline-slug-confirm";
import { SectionCard } from "./section-card";

type LoadState =
	| { phase: "loading" }
	| { phase: "error"; message: string }
	| { phase: "ready"; members: StoredSpaceMember[]; requests: StoredJoinRequest[]; myPeerId: DaemonStatus["peerId"] };

export function MembersTab({ spaceId }: { spaceId: string }) {
	const { t } = useTranslation();
	const [state, setState] = useState<LoadState>({ phase: "loading" });
	const [reloadToken, setReloadToken] = useState(0);

	// biome-ignore lint/correctness/useExhaustiveDependencies: `reloadToken` is a deliberate re-run trigger (bumped after a revoke/approve/reject) — it isn't read inside the effect body.
	useEffect(() => {
		let cancelled = false;
		setState({ phase: "loading" });
		(async () => {
			try {
				const [members, allRequests, status] = await Promise.all([
					backend.spaces.members(spaceId),
					backend.spaces.joinRequests(),
					backend.daemon.status(),
				]);
				if (cancelled) return;
				setState({
					phase: "ready",
					members,
					requests: filterJoinRequestsBySpace(allRequests, spaceId),
					myPeerId: status.peerId,
				});
			} catch (err) {
				if (cancelled) return;
				setState({ phase: "error", message: err instanceof Error ? err.message : String(err) });
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [spaceId, reloadToken]);

	const reload = useCallback(() => setReloadToken((n) => n + 1), []);

	if (state.phase === "loading") {
		return <Empty headline={t("spaceSettings.members.loading")} variant="compact" />;
	}
	if (state.phase === "error") {
		return <Empty headline={t("spaceSettings.members.error", { message: state.message })} />;
	}

	return (
		<div className="flex flex-col gap-8">
			<SectionCard
				description={t("spaceSettings.members.roster.description")}
				title={t("spaceSettings.members.roster.title")}
			>
				<MemberRoster members={state.members} myPeerId={state.myPeerId} onRevoked={reload} spaceId={spaceId} />
			</SectionCard>
			<SectionCard
				description={t("spaceSettings.members.joinRequests.description")}
				title={t("spaceSettings.members.joinRequests.title")}
			>
				<JoinRequestList onDecided={reload} requests={state.requests} />
			</SectionCard>
		</div>
	);
}

function MemberRoster({
	members,
	myPeerId,
	spaceId,
	onRevoked,
}: {
	members: StoredSpaceMember[];
	myPeerId: DaemonStatus["peerId"];
	spaceId: string;
	onRevoked: () => void;
}) {
	const { t } = useTranslation();
	const [revokingPeerId, setRevokingPeerId] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const handleRevoke = useCallback(
		async (peerId: string) => {
			setBusy(true);
			setError(null);
			try {
				await backend.spaces.revokeMember({ spaceId, subjectPeerId: peerId });
				setBusy(false);
				setRevokingPeerId(null);
				onRevoked();
			} catch (err) {
				setBusy(false);
				setError(err instanceof Error ? err.message : String(err));
			}
		},
		[spaceId, onRevoked],
	);

	const arm = useCallback((peerId: string) => {
		setError(null);
		setRevokingPeerId(peerId);
	}, []);

	const disarm = useCallback(() => {
		setRevokingPeerId(null);
		setError(null);
	}, []);

	if (members.length === 0) {
		return <Empty headline={t("spaceSettings.members.roster.empty")} variant="compact" />;
	}

	return (
		<ul className="list list-dense bg-base-100">
			{members.map((member) => (
				<MemberRow
					busy={busy && revokingPeerId === member.peerId}
					error={revokingPeerId === member.peerId ? error : null}
					isYou={myPeerId !== null && member.peerId === myPeerId}
					key={member.peerId}
					member={member}
					onArm={() => arm(member.peerId)}
					onCancel={disarm}
					onConfirm={() => void handleRevoke(member.peerId)}
					revoking={revokingPeerId === member.peerId}
				/>
			))}
		</ul>
	);
}

function MemberRow({
	member,
	isYou,
	revoking,
	busy,
	error,
	onArm,
	onCancel,
	onConfirm,
}: {
	member: StoredSpaceMember;
	isYou: boolean;
	revoking: boolean;
	busy: boolean;
	error: string | null;
	onArm: () => void;
	onCancel: () => void;
	onConfirm: () => void;
}) {
	const { t } = useTranslation();
	const roleSlug = normalizeRoleSlug(member.role);
	const expiry = describeExpiry(member.expiresAt);
	const slug = memberConfirmSlug(member.peerId);

	return (
		<>
			<DenseRow
				actions={
					<button
						className="rounded-md px-2 py-1 text-error/80 text-xs hover:bg-error/10 hover:text-error disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
						disabled={isYou}
						onClick={onArm}
						title={isYou ? t("spaceSettings.members.roster.cannotRevokeSelf") : undefined}
						type="button"
					>
						{t("spaceSettings.members.roster.revoke")}
					</button>
				}
				meta={
					expiry.kind === "never"
						? t("spaceSettings.members.roster.expiry.never")
						: expiry.kind === "expired"
							? t("spaceSettings.members.roster.expiry.expired", { date: expiry.date.toLocaleDateString() })
							: t("spaceSettings.members.roster.expiry.active", { date: expiry.date.toLocaleDateString() })
				}
				primary={
					<span className="flex items-center gap-2">
						<span className="font-mono">{truncatePeerId(member.peerId)}</span>
						{isYou ? <Pill tone="info">{t("spaceSettings.members.roster.you")}</Pill> : null}
					</span>
				}
				status={<Pill tone="neutral">{t(`spaceSettings.roles.${roleSlug}`)}</Pill>}
			/>
			{revoking ? (
				<li className="px-2 pb-2">
					<InlineSlugConfirm
						busy={busy}
						cancelLabel={t("spaceSettings.members.roster.revokeConfirm.cancel")}
						confirmLabel={t("spaceSettings.members.roster.revokeConfirm.confirm")}
						description={t("spaceSettings.members.roster.revokeConfirm.description")}
						error={error}
						expectedSlug={slug}
						onCancel={onCancel}
						onConfirm={onConfirm}
						slugLabel={t("spaceSettings.members.roster.revokeConfirm.slugLabel", { slug })}
						title={t("spaceSettings.members.roster.revokeConfirm.title")}
					/>
				</li>
			) : null}
		</>
	);
}

type Decision = "approve" | "reject";

function JoinRequestList({ requests, onDecided }: { requests: StoredJoinRequest[]; onDecided: () => void }) {
	const { t } = useTranslation();
	const [busyByRequest, setBusyByRequest] = useState<Record<string, Decision>>({});
	const [errors, setErrors] = useState<Record<string, string>>({});

	const decide = useCallback(
		async (request: StoredJoinRequest, decision: Decision) => {
			setBusyByRequest((prev) => ({ ...prev, [request.requestId]: decision }));
			setErrors((prev) => {
				if (!(request.requestId in prev)) return prev;
				const next = { ...prev };
				delete next[request.requestId];
				return next;
			});
			try {
				await backend.spaces.decideJoin({ requestId: request.requestId, approve: decision === "approve" });
				setBusyByRequest((prev) => {
					const next = { ...prev };
					delete next[request.requestId];
					return next;
				});
				onDecided();
			} catch (err) {
				setBusyByRequest((prev) => {
					const next = { ...prev };
					delete next[request.requestId];
					return next;
				});
				setErrors((prev) => ({
					...prev,
					[request.requestId]: err instanceof Error ? err.message : String(err),
				}));
			}
		},
		[onDecided],
	);

	if (requests.length === 0) {
		return <Empty headline={t("spaceSettings.members.joinRequests.empty")} variant="compact" />;
	}

	return (
		<ul className="list list-dense bg-base-100">
			{requests.map((request) => (
				<JoinRequestRow
					busy={busyByRequest[request.requestId]}
					error={errors[request.requestId]}
					key={request.requestId}
					onDecide={(decision) => void decide(request, decision)}
					request={request}
				/>
			))}
		</ul>
	);
}

function JoinRequestRow({
	request,
	busy,
	error,
	onDecide,
}: {
	request: StoredJoinRequest;
	busy: Decision | undefined;
	error: string | undefined;
	onDecide: (decision: Decision) => void;
}) {
	const { t } = useTranslation();
	const roleSlug = roleSlugFromCode(request.requestedRole);
	const disabled = busy !== undefined;

	return (
		<>
			<DenseRow
				actions={
					<div className="flex items-center gap-1">
						<PolymorphButton
							disabled={disabled}
							loading={busy === "reject"}
							onClick={() => onDecide("reject")}
							size="xs"
							type="button"
							variant="ghost"
						>
							{t("spaceSettings.members.joinRequests.reject")}
						</PolymorphButton>
						<PolymorphButton
							disabled={disabled}
							loading={busy === "approve"}
							onClick={() => onDecide("approve")}
							size="xs"
							type="button"
							variant="primary"
						>
							{t("spaceSettings.members.joinRequests.approve")}
						</PolymorphButton>
					</div>
				}
				meta={new Date(request.createdAt * 1000).toLocaleDateString()}
				primary={request.displayName || t("spaceSettings.members.joinRequests.unknownRequester")}
				status={<Pill tone="neutral">{t(`spaceSettings.roles.${roleSlug}`)}</Pill>}
				sub={request.deviceName}
			/>
			{error ? <li className="bg-error/5 px-3 py-2 text-error text-xs">{error}</li> : null}
		</>
	);
}
