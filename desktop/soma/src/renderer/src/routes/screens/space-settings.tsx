/**
 * Space settings — Cutover 1 of the UI revamp.
 *
 * Old layout (pre-revamp): a single flat column with summary +
 * access + workspace-model sections stacked.
 *
 * New layout per [refs space-lifecycle §4.2](../../../../../../../../docs/src/architecture/prd/ui-revamp-v0-refs-space-lifecycle.md):
 * a horizontal `SettingsTabs` strip wrapping per-tab content cards.
 * Tabs in fixed order: **General · Members · Bots · Assistant ·
 * Sharing · Danger**.
 *
 * The Bots tab is the v0-priority new surface (PRD §4.4) and lives in
 * its own file. The other tabs adapt the pre-revamp sections to the
 * new shell; their internal behavior is unchanged.
 */
import { useSpaceQuery } from "@app/queries/spaces";
import { SettingsTabs } from "@soma/ui/components/nav/settings-tabs";
import { Cpu, Settings, Shield, Sliders, Trash2, Users } from "react-feather";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router";
import { BotsTab } from "./space-settings/bots-tab";
import {
	CurrentAccessSection,
	JoinRequestsSection,
	SpaceAccessSummary,
} from "./space-settings/access-sections";
import { useSpaceAccessSettings } from "./space-settings/use-space-access-settings";
import { useWorkspaceAgentSettings } from "./space-settings/use-workspace-agent-settings";
import { WorkspaceModelSection } from "./space-settings/workspace-model-section";

type TabId =
	| "general"
	| "members"
	| "bots"
	| "assistant"
	| "sharing"
	| "danger";

function Component(): React.JSX.Element {
	const { t } = useTranslation("common");
	const { spaceId } = useParams<{ spaceId: string }>();
	const [activeTab, setActiveTab] = useState<TabId>("general");
	const spaceQuery = useSpaceQuery(spaceId ?? "");

	const spaceLabel =
		spaceQuery.data?.displayName?.trim() ||
		spaceId ||
		t("space.settings.unknown", "Unknown");

	const tabs = [
		{
			id: "general",
			label: t("space.settings.tabs.general", "General"),
			icon: <Settings className="size-3.5" />,
		},
		{
			id: "members",
			label: t("space.settings.tabs.members", "Members"),
			icon: <Users className="size-3.5" />,
		},
		{
			id: "bots",
			label: t("space.settings.tabs.bots", "Bots"),
			icon: <Cpu className="size-3.5" />,
		},
		{
			id: "assistant",
			label: t("space.settings.tabs.assistant", "Assistant"),
			icon: <Sliders className="size-3.5" />,
		},
		{
			id: "sharing",
			label: t("space.settings.tabs.sharing", "Sharing"),
			icon: <Shield className="size-3.5" />,
		},
		{
			id: "danger",
			label: t("space.settings.tabs.danger", "Danger"),
			icon: <Trash2 className="size-3.5" />,
			tone: "danger" as const,
		},
	];

	return (
		<div className="flex flex-col gap-4">
			<header className="flex flex-col gap-1">
				<h2 className="font-semibold text-lg">
					{t("space.settings.title", "Space settings")}
				</h2>
				<p className="text-base-content/60 text-sm">
					{spaceLabel}
					{spaceId ? (
						<span className="ml-2 font-mono text-base-content/50 text-xs">
							({spaceId})
						</span>
					) : null}
				</p>
				<SettingsTabs
					activeId={activeTab}
					aria-label="Space settings"
					onChange={(id) => setActiveTab(id as TabId)}
					tabs={tabs}
				/>
			</header>

			{activeTab === "general" ? (
				<GeneralTab spaceLabel={spaceLabel} />
			) : null}

			{activeTab === "members" ? <MembersTab spaceId={spaceId} /> : null}

			{activeTab === "bots" ? <BotsTab spaceId={spaceId} /> : null}

			{activeTab === "assistant" ? (
				<AssistantTab spaceId={spaceId} />
			) : null}

			{activeTab === "sharing" ? <PlaceholderTab kind="sharing" /> : null}

			{activeTab === "danger" ? <PlaceholderTab kind="danger" /> : null}
		</div>
	);
}

function MembersTab({ spaceId }: { spaceId: string | undefined }) {
	const accessSettings = useSpaceAccessSettings(spaceId);
	return (
		<div className="flex flex-col gap-4">
			{accessSettings.spaceOpsMessage ? (
				<div className="rounded-lg bg-base-200 px-3 py-2 text-sm">
					{accessSettings.spaceOpsMessage}
				</div>
			) : null}
			<SpaceAccessSummary
				memberRows={accessSettings.memberRows}
				pendingJoinRequests={accessSettings.pendingJoinRequests}
				spaceId={spaceId}
			/>
			<JoinRequestsSection {...accessSettings} />
			<CurrentAccessSection {...accessSettings} />
		</div>
	);
}

function AssistantTab({ spaceId }: { spaceId: string | undefined }) {
	const workspaceSettings = useWorkspaceAgentSettings(spaceId);
	return (
		<WorkspaceModelSection
			effectiveConfig={workspaceSettings.effectiveConfig}
			isSaving={workspaceSettings.isSaving}
			newCapabilityModel={workspaceSettings.newCapabilityModel}
			onAddCapabilityModel={workspaceSettings.addCapabilityModel}
			onNewCapabilityModelChange={workspaceSettings.setNewCapabilityModel}
			onPersist={workspaceSettings.persist}
			onRemoveCapabilityModel={workspaceSettings.removeCapabilityModel}
			onUpdateCapability={workspaceSettings.updateCapability}
			rows={workspaceSettings.capabilityRows}
			setWorkspaceDraft={workspaceSettings.setWorkspaceDraft}
			spaceId={spaceId}
			workspaceDraft={workspaceSettings.workspaceDraft}
		/>
	);
}

function GeneralTab({ spaceLabel }: { spaceLabel: string }) {
	const { t } = useTranslation("common");
	return (
		<section className="rounded-md border border-base-300 bg-base-100 p-4 text-sm">
			<div className="flex flex-col gap-1">
				<div className="text-base-content/60 text-xs uppercase">
					{t("space.settings.general.name", "Display name")}
				</div>
				<div className="font-medium">{spaceLabel}</div>
			</div>
			<p className="mt-3 text-base-content/60 text-xs">
				{t(
					"space.settings.general.placeholder",
					"Display-name editing and other general controls will land here. v0 cutover-1 focuses on Members + Bots.",
				)}
			</p>
		</section>
	);
}

function PlaceholderTab({ kind }: { kind: "sharing" | "danger" }) {
	const { t } = useTranslation("common");
	const message =
		kind === "sharing"
			? t(
					"space.settings.sharing.placeholder",
					"Sharing controls (invite links, public preview) land in a follow-up cutover.",
				)
			: t(
					"space.settings.danger.placeholder",
					"Destructive actions (delete space, leave space) land in a follow-up cutover behind the locked slug-confirm gate.",
				);
	return (
		<section className="rounded-md border border-base-300 bg-base-100 p-4 text-base-content/70 text-sm">
			{message}
		</section>
	);
}

export { Component };
