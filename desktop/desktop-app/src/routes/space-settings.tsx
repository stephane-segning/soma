/**
 * SpaceSettingsPage — `spaces/:spaceId/settings`.
 *
 * The ADR-0005 §3 tabbed settings shell for a space: horizontal
 * pill/underline tabs (`SettingsTabs`) over one tab body at a time,
 * auto-save on blur inside each tab, no global Save button. Mirrors the
 * app-level `/settings` route's own shell shape (`routes/settings.tsx`)
 * so the two settings surfaces read as siblings.
 *
 * Four tabs — Members, Invites, Bots, Assistant — because those are the
 * four space-management backends that are fully built (see this
 * feature's own design brief: `spaces.members`/`joinRequests`/
 * `decideJoin`/`revokeMember`, `invites.create`/`list`/`revoke`,
 * `spaces.bots`/`issueIssuerCapability`/`revokeBot`, and
 * `agent.config.getSpace`/`setSpace`/`clearSpace`/`validate` all existed
 * with zero UI call sites before this route). Each tab follows the same
 * shape: a `{ spaceId }`-prop component owning its own data-fetching
 * effect (`MembersTab`, `InvitesTab`, `BotsTab`, `AssistantTab`).
 *
 * Invites sits next to Members rather than as its own top-level concept
 * — both are "who can get into this space" surfaces, and the pending
 * join-request queue Members already hosts is the other half of the
 * same lifecycle an invite link kicks off.
 *
 * `/spaces/:spaceId/members` redirects here (see `router.tsx`) — its
 * content is now the Members tab. `/spaces/:spaceId/info` had no
 * content behind it (an `Empty` placeholder for a "space info" screen
 * that was never built) and is removed outright rather than redirected
 * into a tab that has nothing to do with it.
 */
import { SettingsTabs } from "@soma/ui/components/nav/settings-tabs";
import { DensityProvider } from "@soma/ui/components/primitives/density-provider";
import { Empty } from "@soma/ui/components/primitives/empty";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router";
import { AssistantTab } from "../components/settings/assistant-tab";
import { BotsTab } from "../components/settings/bots-tab";
import { InvitesTab } from "../components/settings/invites-tab";
import { MembersTab } from "../components/settings/members-tab";

type SpaceSettingsTabId = "members" | "invites" | "bots" | "assistant";

export function SpaceSettingsPage() {
	const { t } = useTranslation();
	// `useParams()` is safe here: this component only ever renders through
	// the `spaces/:spaceId/settings` route's own element, inside the
	// router's Outlet chain (unlike a component passed as an `AppLayout`
	// column prop — see `chat-panel.tsx`'s doc comment for why that
	// distinction matters).
	const { spaceId } = useParams<{ spaceId: string }>();
	const [active, setActive] = useState<SpaceSettingsTabId>("members");

	const tabs = useMemo(
		() => [
			{ id: "members", label: t("spaceSettings.tabs.members") },
			{ id: "invites", label: t("spaceSettings.tabs.invites") },
			{ id: "bots", label: t("spaceSettings.tabs.bots") },
			{ id: "assistant", label: t("spaceSettings.tabs.assistant") },
		],
		[t],
	);

	if (!spaceId) {
		// Unreachable through the registered route (the path always supplies
		// `:spaceId`) — `useParams`'s type just can't express that. Kept as
		// an inline status line rather than a silent blank screen.
		return (
			<main className="mx-auto w-full max-w-4xl px-8 py-10">
				<Empty headline={t("spaceSettings.notFound")} />
			</main>
		);
	}

	return (
		<DensityProvider density="dense">
			<main className="mx-auto w-full max-w-4xl px-8 py-10">
				<header className="mb-4 flex flex-col gap-1">
					<h1 className="font-semibold text-2xl">{t("spaceSettings.title")}</h1>
					<p className="font-mono text-base-content/60 text-xs">{spaceId}</p>
				</header>

				<SettingsTabs
					activeId={active}
					aria-label={t("spaceSettings.tabs.ariaLabel")}
					onChange={(id) => setActive(id as SpaceSettingsTabId)}
					tabs={tabs}
				/>

				<div className="mt-6">
					{active === "members" ? <MembersTab spaceId={spaceId} /> : null}
					{active === "invites" ? <InvitesTab spaceId={spaceId} /> : null}
					{active === "bots" ? <BotsTab spaceId={spaceId} /> : null}
					{active === "assistant" ? <AssistantTab spaceId={spaceId} /> : null}
				</div>
			</main>
		</DensityProvider>
	);
}
