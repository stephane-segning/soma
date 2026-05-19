/**
 * BotsTab — the v0-priority surface inside space settings.
 *
 * Locked by [PRD §4.4](../../../../../../../../docs/src/architecture/prd/ui-revamp-v0.md)
 * and [refs main §4](../../../../../../../../docs/src/architecture/prd/ui-revamp-v0-refs.md).
 *
 * Flow:
 *  1. List rendered via {@link BotList} (Wave 3A). Empty state has an
 *     `Add bot` CTA.
 *  2. Add bot opens an inline panel with two stacked cards:
 *     - {@link PeerAddressInput} — paste the bot's peer id
 *     - {@link CapabilityForm} — alias + scoped grants + expiry +
 *       Issue
 *  3. Issue routes through `useSpaceBots().addBot`, which talks to the
 *     daemon via `issueIssuerCapability` (see
 *     ./use-space-bots.ts for the cutover-1 stub vs. the real wiring
 *     once the napi list endpoint lands).
 */
import {
	type CapabilityFormValue,
	CapabilityForm,
	type ScopeGroup,
} from "@soma/ui/components/forms/capability-form";
import {
	PeerAddressInput,
	type PeerAddressValidation,
} from "@soma/ui/components/forms/peer-address-input";
import { BotList } from "@soma/ui/components/lists/bot-list";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useSpaceBots } from "./use-space-bots";

// The scope catalog is v0-hardcoded; once the backend exposes the
// authoritative capability scopes per space, drive this from there.
// Locked groups match the Bot role's intuitive resource buckets.
const SCOPE_GROUPS: ScopeGroup[] = [
	{
		id: "documents",
		label: "Documents",
		scopes: [
			{ id: "doc:read", label: "Read documents" },
			{ id: "doc:write", label: "Write documents" },
			{
				id: "doc:delete",
				label: "Delete documents",
				description: "Allow removing pages this bot can read.",
			},
		],
	},
	{
		id: "messages",
		label: "Messages",
		scopes: [
			{ id: "msg:read", label: "Read chat" },
			{ id: "msg:post", label: "Post replies" },
		],
	},
	{
		id: "attachments",
		label: "Attachments",
		scopes: [
			{ id: "blob:read", label: "Read attachments" },
			{ id: "blob:upload", label: "Upload attachments" },
		],
	},
	{
		id: "membership",
		label: "Membership",
		scopes: [
			{
				id: "membership:invite",
				label: "Invite members",
				description:
					"Bot may issue MembershipCapability for new peers in this space.",
			},
		],
	},
];

const PEER_ID_PATTERN = /^12D3Koo[\w]{20,}$/;

export function BotsTab({
	spaceId,
	highlightedPeerId,
}: {
	spaceId: string | undefined;
	/**
	 * Bot peer id to scroll into view and ring-highlight on first render
	 * after a deep link (e.g. `?peerId=` set by a `!bot` mention click).
	 * Resolved to a BotList row id by matching against `bot.peerId`.
	 */
	highlightedPeerId?: string;
}) {
	const { t } = useTranslation("common");
	const space = useSpaceBots(spaceId);
	const [showAdd, setShowAdd] = useState(false);
	const highlightedBotId = highlightedPeerId
		? space.bots.find((b) => b.peerId === highlightedPeerId)?.id
		: undefined;

	return (
		<div className="flex flex-col gap-4">
			<div className="flex items-center justify-between">
				<div>
					<h3 className="font-medium text-base">
						{t("space.settings.bots.title", "Bots")}
					</h3>
					<p className="text-base-content/60 text-sm">
						{t(
							"space.settings.bots.description",
							"Bots are p2p peers granted scoped capabilities in this space. Address them inline with @bot:<alias>.",
						)}
					</p>
				</div>
				{!showAdd && (space.bots.length > 0 || space.isLoading) ? (
					<button
						className="btn btn-primary btn-sm"
						onClick={() => setShowAdd(true)}
						type="button"
					>
						{t("space.settings.bots.add", "Add bot")}
					</button>
				) : null}
			</div>

			{showAdd ? (
				<AddBotPanel
					addError={space.addError}
					clearAddError={space.clearAddError}
					isAdding={space.isAdding}
					onCancel={() => setShowAdd(false)}
					onSubmit={async (input) => {
						await space.addBot(input);
						setShowAdd(false);
					}}
				/>
			) : null}

			{space.loadError ? (
				<div className="rounded-md border border-error/40 bg-error/5 px-3 py-2 text-error text-sm">
					{space.loadError}
				</div>
			) : null}

			{!showAdd ? (
				<BotList
					bots={space.bots}
					highlightedId={highlightedBotId}
					onAddBot={() => setShowAdd(true)}
					onOverflow={() => undefined}
					onRetry={(id) => {
						const bot = space.bots.find((b) => b.id === id);
						if (bot) space.retryBot(bot);
					}}
				/>
			) : null}
		</div>
	);
}

function AddBotPanel({
	addError,
	clearAddError,
	isAdding,
	onCancel,
	onSubmit,
}: {
	addError: string | null;
	clearAddError: () => void;
	isAdding: boolean;
	onCancel: () => void;
	onSubmit: (input: {
		peerId: string;
		alias: string;
		scopeIds: string[];
		expiryDate: string | null;
	}) => Promise<void>;
}) {
	const { t } = useTranslation("common");
	const [peerRaw, setPeerRaw] = useState("");
	const [peerPreview, setPeerPreview] =
		useState<PeerAddressValidation | null>(null);
	const [capability, setCapability] = useState<CapabilityFormValue>({
		alias: "",
		grantedScopeIds: ["doc:read"],
		expiryDate: null,
	});

	function validate(address: string): PeerAddressValidation | null {
		const trimmed = address.trim();
		if (trimmed.length === 0) return null;
		if (PEER_ID_PATTERN.test(trimmed)) {
			return { kind: "valid", peerId: trimmed };
		}
		return {
			kind: "invalid",
			error: t(
				"space.settings.bots.peer.invalid",
				"Expected a libp2p peer id (starts with 12D3Koo… followed by base58).",
			),
		};
	}

	const peerId =
		peerPreview?.kind === "valid" ? peerPreview.peerId : null;
	const canSubmit =
		peerId !== null &&
		capability.alias.trim().length > 0 &&
		capability.grantedScopeIds.length > 0;

	return (
		<section className="flex flex-col gap-3 rounded-md border border-base-300 bg-base-100 p-4">
			<header className="flex items-center justify-between">
				<h4 className="font-medium text-sm">
					{t("space.settings.bots.add.heading", "Add a bot")}
				</h4>
				<button
					className="btn btn-ghost btn-xs"
					disabled={isAdding}
					onClick={onCancel}
					type="button"
				>
					{t("common.cancel", "Cancel")}
				</button>
			</header>
			<p className="text-base-content/60 text-xs">
				{t(
					"space.settings.bots.add.help",
					"Paste the bot's peer id (shared out-of-band by its operator). The bot will only join with the scopes you grant below.",
				)}
			</p>

			<PeerAddressInput
				label={t("space.settings.bots.add.peer-label", "Bot peer id")}
				onBlur={() => setPeerPreview(validate(peerRaw))}
				onChange={(next) => {
					setPeerRaw(next);
					if (peerPreview) setPeerPreview(null);
				}}
				preview={peerPreview}
				value={peerRaw}
			/>

			{peerId ? (
				<CapabilityForm
					issueError={addError ?? undefined}
					issuing={isAdding}
					onCancel={onCancel}
					onChange={(next) => {
						setCapability(next);
						if (addError) clearAddError();
					}}
					onIssue={async () => {
						if (!canSubmit || !peerId) return;
						await onSubmit({
							peerId,
							alias: capability.alias.trim(),
							scopeIds: capability.grantedScopeIds,
							expiryDate: capability.expiryDate,
						});
					}}
					peerId={peerId}
					scopeGroups={SCOPE_GROUPS}
					value={capability}
				/>
			) : null}
		</section>
	);
}
