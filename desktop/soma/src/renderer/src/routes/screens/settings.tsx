import { useTranslation } from "react-i18next";
import { ConnectivitySection } from "./settings/connectivity-section";
import { DaemonSection } from "./settings/daemon-section";
import { ModelFeaturesSection } from "./settings/model-features-section";
import { PeopleAccessSection, useMembershipSettings } from "./settings/use-membership-settings";
import { useGlobalAgentSettings } from "./settings/use-global-agent-settings";

function Component(): React.JSX.Element {
	const { t } = useTranslation("common");
	const agentSettings = useGlobalAgentSettings();
	const membershipSettings = useMembershipSettings();

	return (
		<div className="space-y-6">
			<h1 className="font-semibold text-2xl">{t("settings.title", "Settings")}</h1>
			<DaemonSection />
			<PeopleAccessSection {...membershipSettings} />
			<ConnectivitySection
				draft={agentSettings.draft}
				setDraft={agentSettings.setDraft}
				title={t("settings.connectivity", "Connectivity")}
			/>
			<ModelFeaturesSection
				addCapabilityModel={agentSettings.addCapabilityModel}
				isSaving={agentSettings.isSaving}
				newCapabilityModel={agentSettings.newCapabilityModel}
				normalizeCapabilities={agentSettings.normalizeCapabilities}
				onNewCapabilityModelChange={agentSettings.setNewCapabilityModel}
				persist={agentSettings.persist}
				removeCapabilityModel={agentSettings.removeCapabilityModel}
				rows={agentSettings.capabilityRows}
				updateCapability={agentSettings.updateCapability}
			/>
		</div>
	);
}

Component.displayName = "SettingsScreen";

export { Component };
