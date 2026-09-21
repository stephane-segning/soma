/**
 * BotsTab — `spaces/:spaceId/settings` "Bots" tab body.
 *
 * Composes:
 * - `BotList` (`@soma/ui`) for the roster — status pills, inline failure
 *   rows, and its own empty-state "Add bot" CTA all come from the
 *   primitive as-is.
 * - The Add-bot 2-step inline form (ADR-0005 §4 / PRD refs §4): step 1 is
 *   `PeerAddressInput` (paste, validate on blur), step 2 is
 *   `CapabilityForm` (Identity / Scopes / Expiry / Issue), revealed only
 *   once step 1 parses a valid peer id — one scroll surface, no wizard.
 * - Revoke behind an `InlineSlugConfirm` (ADR-0005 §3). `BotList` owns
 *   its own row rendering (no per-row injection point), so the confirm
 *   panel renders below the list instead of as a sibling row the way the
 *   hand-rolled Members roster does — `highlightedId` keeps the targeted
 *   row visually tied to it.
 *
 * `targetMultiaddrs` carries the exact multiaddr the operator pasted, not
 * just the parsed peer id — required for a freshly-deployed bot with no
 * prior connection to receive the offer at all.
 */
import type { StoredSpaceBot } from "@soma/sdk";
import { PolymorphButton } from "@soma/ui/components/actions/polymorph-button";
import { CapabilityForm, type CapabilityFormValue, type ScopeGroup } from "@soma/ui/components/forms/capability-form";
import { PeerAddressInput, type PeerAddressValidation } from "@soma/ui/components/forms/peer-address-input";
import { type Bot, BotList } from "@soma/ui/components/lists/bot-list";
import { Empty } from "@soma/ui/components/primitives/empty";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { backend } from "../../lib/backend";
import { botConfirmSlug, expiryDateToEpochSeconds, parsePeerAddress, toUiBot } from "../../lib/space-settings";
import { InlineSlugConfirm } from "./inline-slug-confirm";
import { SectionCard } from "./section-card";

type LoadState =
	| { phase: "loading" }
	| { phase: "error"; message: string }
	| { phase: "ready"; bots: StoredSpaceBot[] };

const EMPTY_CAPABILITY_VALUE: CapabilityFormValue = {
	alias: "",
	grantedScopeIds: [],
	expiryDate: null,
};

export function BotsTab({ spaceId }: { spaceId: string }) {
	const { t } = useTranslation();
	const [state, setState] = useState<LoadState>({ phase: "loading" });
	const [reloadToken, setReloadToken] = useState(0);
	const [adding, setAdding] = useState(false);

	// biome-ignore lint/correctness/useExhaustiveDependencies: `reloadToken` is a deliberate re-run trigger (bumped after issue/revoke) — it isn't read inside the effect body.
	useEffect(() => {
		let cancelled = false;
		setState({ phase: "loading" });
		(async () => {
			try {
				const bots = await backend.spaces.bots(spaceId);
				if (cancelled) return;
				setState({ phase: "ready", bots });
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
	const openAddBot = useCallback(() => setAdding(true), []);
	const closeAddBot = useCallback(() => setAdding(false), []);

	if (state.phase === "loading") {
		return <Empty headline={t("spaceSettings.bots.loading")} variant="compact" />;
	}
	if (state.phase === "error") {
		return <Empty headline={t("spaceSettings.bots.error", { message: state.message })} />;
	}

	return (
		<SectionCard
			actions={
				adding ? null : (
					<PolymorphButton onClick={openAddBot} size="sm" type="button" variant="primary">
						{t("spaceSettings.bots.addBot.cta")}
					</PolymorphButton>
				)
			}
			description={t("spaceSettings.bots.description")}
			title={t("spaceSettings.bots.title")}
		>
			<div className="flex flex-col gap-6">
				{adding ? (
					<AddBotForm
						onCancel={closeAddBot}
						onIssued={() => {
							closeAddBot();
							reload();
						}}
						spaceId={spaceId}
					/>
				) : null}
				<BotRoster bots={state.bots} onAddBot={openAddBot} onRevoked={reload} spaceId={spaceId} />
			</div>
		</SectionCard>
	);
}

function AddBotForm({ spaceId, onCancel, onIssued }: { spaceId: string; onCancel: () => void; onIssued: () => void }) {
	const { t } = useTranslation();
	const [address, setAddress] = useState("");
	const [preview, setPreview] = useState<PeerAddressValidation | null>(null);
	const [capability, setCapability] = useState<CapabilityFormValue>(EMPTY_CAPABILITY_VALUE);
	const [issuing, setIssuing] = useState(false);
	const [issueError, setIssueError] = useState<string | null>(null);

	const scopeGroups: ScopeGroup[] = useMemo(
		() => [
			{
				id: "membership",
				label: t("spaceSettings.bots.addBot.scopes.group"),
				scopes: [
					{
						id: "issue:membership",
						label: t("spaceSettings.bots.addBot.scopes.issueMembership.label"),
						description: t("spaceSettings.bots.addBot.scopes.issueMembership.description"),
					},
				],
			},
		],
		[t],
	);

	const validateAddress = useCallback(() => {
		const parsed = parsePeerAddress(address);
		if (parsed.kind === "empty") {
			setPreview(null);
		} else if (parsed.kind === "valid") {
			setPreview({ kind: "valid", peerId: parsed.peerId });
		} else {
			setPreview({ kind: "invalid", error: t(`spaceSettings.bots.addBot.errors.${parsed.reason}`) });
		}
	}, [address, t]);

	const handleIssue = useCallback(async () => {
		const parsed = parsePeerAddress(address);
		if (parsed.kind !== "valid") return;
		setIssuing(true);
		setIssueError(null);
		try {
			await backend.spaces.issueIssuerCapability({
				spaceId,
				targetPeerId: parsed.peerId,
				expiresAt: expiryDateToEpochSeconds(capability.expiryDate),
				alias: capability.alias.trim() || null,
				scopes: capability.grantedScopeIds,
				targetMultiaddrs: [parsed.address],
			});
			setIssuing(false);
			onIssued();
		} catch (err) {
			setIssuing(false);
			setIssueError(err instanceof Error ? err.message : String(err));
		}
	}, [address, spaceId, capability, onIssued]);

	return (
		<div className="surface-card flex flex-col gap-3 p-3">
			<PeerAddressInput
				autoFocus
				label={t("spaceSettings.bots.addBot.peerAddress.label")}
				onBlur={validateAddress}
				onChange={setAddress}
				preview={preview}
				value={address}
			/>
			{preview?.kind === "valid" ? (
				<CapabilityForm
					issueError={issueError ?? undefined}
					issuing={issuing}
					onCancel={onCancel}
					onChange={setCapability}
					onIssue={() => void handleIssue()}
					peerId={preview.peerId}
					scopeGroups={scopeGroups}
					value={capability}
				/>
			) : (
				<div className="flex items-center justify-end">
					<PolymorphButton onClick={onCancel} size="sm" type="button" variant="ghost">
						{t("spaceSettings.bots.addBot.cancel")}
					</PolymorphButton>
				</div>
			)}
		</div>
	);
}

function BotRoster({
	bots,
	spaceId,
	onAddBot,
	onRevoked,
}: {
	bots: StoredSpaceBot[];
	spaceId: string;
	onAddBot: () => void;
	onRevoked: () => void;
}) {
	const { t } = useTranslation();
	const uiBots = useMemo<Bot[]>(() => bots.map(toUiBot), [bots]);
	const [revokingId, setRevokingId] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const revokingBot = revokingId ? uiBots.find((bot) => bot.id === revokingId) : undefined;

	const handleRevoke = useCallback(async () => {
		if (!revokingId) return;
		setBusy(true);
		setError(null);
		try {
			await backend.spaces.revokeBot({ spaceId, delegatePeerId: revokingId });
			setBusy(false);
			setRevokingId(null);
			onRevoked();
		} catch (err) {
			setBusy(false);
			setError(err instanceof Error ? err.message : String(err));
		}
	}, [revokingId, spaceId, onRevoked]);

	return (
		<div className="flex flex-col gap-3">
			<BotList
				bots={uiBots}
				highlightedId={revokingId ?? undefined}
				onAddBot={onAddBot}
				onOverflow={(id) => {
					setError(null);
					setRevokingId(id);
				}}
			/>
			{revokingBot ? (
				<InlineSlugConfirm
					busy={busy}
					cancelLabel={t("spaceSettings.bots.revokeConfirm.cancel")}
					confirmLabel={t("spaceSettings.bots.revokeConfirm.confirm")}
					description={t("spaceSettings.bots.revokeConfirm.description")}
					error={error}
					expectedSlug={botConfirmSlug(revokingBot)}
					onCancel={() => {
						setRevokingId(null);
						setError(null);
					}}
					onConfirm={() => void handleRevoke()}
					slugLabel={t("spaceSettings.bots.revokeConfirm.slugLabel", { slug: botConfirmSlug(revokingBot) })}
					title={t("spaceSettings.bots.revokeConfirm.title", { alias: revokingBot.alias })}
				/>
			) : null}
		</div>
	);
}
