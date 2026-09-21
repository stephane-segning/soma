/**
 * AssistantTab — `spaces/:spaceId/settings` "Assistant" tab body.
 *
 * Fetches this space's own AI-provider config override (`getSpace`) and
 * the default scope's (`getDefault`, for inherit-hint display), plus
 * `spaces.get` + `daemon.status` to gate writes to the space owner only.
 * That gate mirrors the backend's own rule exactly
 * (`backend/crates/daemon/src/handle/agent_config.rs`: space-scope
 * writes require the caller to be the space's locally pinned owner;
 * reads require only membership) — a non-owner sees a read-only form
 * with an inline explanation instead of filling one out only to hit an
 * authorization error on the first field's blur. The backend remains
 * the real enforcement boundary either way.
 */
import type { AgentProviderConfigView, ValidateAgentProviderConfigArgs } from "@soma/sdk";
import { Empty } from "@soma/ui/components/primitives/empty";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { type AssistantFormState, buildSpaceSaveArgs, isSpaceOwner } from "../../lib/assistant-config";
import { backend } from "../../lib/backend";
import { AssistantProviderForm } from "./assistant-provider-form";

type LoadState =
	| { phase: "loading" }
	| { phase: "error"; message: string }
	| { phase: "ready"; space: AgentProviderConfigView; defaultConfig: AgentProviderConfigView; readOnly: boolean };

export function AssistantTab({ spaceId }: { spaceId: string }) {
	const { t } = useTranslation();
	const [state, setState] = useState<LoadState>({ phase: "loading" });

	useEffect(() => {
		let cancelled = false;
		setState({ phase: "loading" });
		(async () => {
			try {
				const [space, defaultConfig, spaceInfo, status] = await Promise.all([
					backend.agent.config.getSpace(spaceId),
					backend.agent.config.getDefault(),
					backend.spaces.get(spaceId),
					backend.daemon.status(),
				]);
				if (cancelled) return;
				setState({
					phase: "ready",
					space,
					defaultConfig,
					readOnly: !isSpaceOwner(spaceInfo.ownerPeerId, status.peerId),
				});
			} catch (err) {
				if (cancelled) return;
				setState({ phase: "error", message: err instanceof Error ? err.message : String(err) });
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [spaceId]);

	const handleSave = useCallback(
		(form: AssistantFormState) => backend.agent.config.setSpace(buildSpaceSaveArgs(spaceId, form)),
		[spaceId],
	);
	const handleValidate = useCallback(
		(args: ValidateAgentProviderConfigArgs) => backend.agent.config.validate(args),
		[],
	);

	if (state.phase === "loading") {
		return <Empty headline={t("assistant.loading")} variant="compact" />;
	}
	if (state.phase === "error") {
		return <Empty headline={t("assistant.error", { message: state.message })} />;
	}

	return (
		<AssistantProviderForm
			inherited={state.defaultConfig}
			// Forces a fresh mount (and fresh internal form state) if `spaceId`
			// changes without this whole tab unmounting — e.g. switching spaces
			// via the rail while already on the Assistant tab. See
			// `AssistantProviderForm`'s doc comment: it intentionally does NOT
			// re-sync from a changed `view` prop on its own.
			key={spaceId}
			onSave={handleSave}
			onValidate={handleValidate}
			readOnly={state.readOnly}
			readOnlyMessage={state.readOnly ? t("assistant.readOnlyNotOwner") : undefined}
			showPollInterval={false}
			view={state.space}
		/>
	);
}
