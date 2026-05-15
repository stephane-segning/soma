import { useSpaceQuery } from "@app/queries/spaces";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router";
import {
	CurrentAccessSection,
	JoinRequestsSection,
	SpaceAccessSummary,
} from "./space-settings/access-sections";
import { useSpaceAccessSettings } from "./space-settings/use-space-access-settings";
import { useWorkspaceAgentSettings } from "./space-settings/use-workspace-agent-settings";
import { WorkspaceModelSection } from "./space-settings/workspace-model-section";

function Component(): React.JSX.Element {
	const { t } = useTranslation("common");
	const { spaceId } = useParams<{ spaceId: string }>();
	const spaceQuery = useSpaceQuery(spaceId ?? "");
	const accessSettings = useSpaceAccessSettings(spaceId);
	const workspaceSettings = useWorkspaceAgentSettings(spaceId);

	return (
		<div className="space-y-4">
			<h2 className="font-semibold text-lg">{t("space.settings.title", "Space settings")}</h2>
			<p className="text-base-content/70 text-sm">
				Space: {spaceQuery.data?.displayName?.trim() || spaceId || "Unknown"}
				{spaceId ? <span className="ml-2 font-mono text-base-content/60 text-xs">({spaceId})</span> : null}
			</p>
			{accessSettings.spaceOpsMessage ? (
				<div className="rounded-lg bg-base-200 px-3 py-2 text-sm">{accessSettings.spaceOpsMessage}</div>
			) : null}
			<SpaceAccessSummary
				memberRows={accessSettings.memberRows}
				pendingJoinRequests={accessSettings.pendingJoinRequests}
				spaceId={spaceId}
			/>
			<JoinRequestsSection {...accessSettings} />
			<CurrentAccessSection {...accessSettings} />
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
		</div>
	);
}

export { Component };
