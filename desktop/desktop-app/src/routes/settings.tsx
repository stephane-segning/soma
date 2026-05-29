/**
 * SettingsPage — `/settings`.
 *
 * Composes the real settings surface from `@soma/ui` primitives:
 * `SettingsTabs` for section navigation, `Switcher` for picker-shaped
 * controls (language, theme), `LauncherCard` for the appearance card
 * stack, `CapabilityForm` for the capability-issuing surface, and
 * `PeerAddressInput` for the manual peer-connect example.
 *
 * Real wiring is light on purpose — auto-save semantics, persistence,
 * and provider-backed validation land alongside the broader settings
 * IPC. This page exists today to (a) prove the `@soma/ui` stack
 * actually composes into a usable settings surface, and (b) give the
 * shell something to land on when the user hits `⌘,`.
 */

import type { DaemonStatus } from "@soma/sdk";
import { LauncherCard } from "@soma/ui/components/cards/launcher-card";
import { CapabilityForm, type CapabilityFormValue, type ScopeGroup } from "@soma/ui/components/forms/capability-form";
import { PeerAddressInput, type PeerAddressValidation } from "@soma/ui/components/forms/peer-address-input";
import { Switcher, type SwitcherItem } from "@soma/ui/components/forms/switcher";
import { SettingsTabs } from "@soma/ui/components/nav/settings-tabs";
import { DensityProvider } from "@soma/ui/components/primitives/density-provider";
import { Empty } from "@soma/ui/components/primitives/empty";
import { Kbd } from "@soma/ui/components/primitives/kbd";
import { Pill } from "@soma/ui/components/primitives/pill";
import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { backend } from "../lib/backend";

type TabId = "general" | "account" | "appearance" | "capabilities" | "network" | "advanced";

type ThemeChoice = "light" | "dark" | "system";

const LANG_ITEMS: ReadonlyArray<SwitcherItem> = [
	{ id: "en", label: "English" },
	{ id: "fr", label: "Français" },
];

export function SettingsPage() {
	const { t } = useTranslation();
	const [active, setActive] = useState<TabId>("general");

	const tabs = useMemo(
		() => [
			{ id: "general", label: t("settings.tabs.general") },
			{ id: "account", label: t("settings.tabs.account") },
			{ id: "appearance", label: t("settings.tabs.appearance") },
			{ id: "capabilities", label: t("settings.tabs.capabilities") },
			{ id: "network", label: t("settings.tabs.network") },
			{ id: "advanced", label: t("settings.tabs.advanced") },
		],
		[t],
	);

	return (
		<DensityProvider density="dense">
			<main className="mx-auto w-full max-w-4xl px-8 py-10">
				<header className="mb-4 flex flex-col gap-1">
					<h1 className="font-semibold text-2xl">{t("nav.settings")}</h1>
					<p className="text-sm opacity-70">{t("settings.subtitle")}</p>
				</header>

				<SettingsTabs
					activeId={active}
					aria-label={t("settings.tabs.aria_label")}
					onChange={(id) => setActive(id as TabId)}
					tabs={tabs}
				/>

				<div className="mt-6 flex flex-col gap-4">
					{active === "general" ? <GeneralSection /> : null}
					{active === "account" ? <AccountSection /> : null}
					{active === "appearance" ? <AppearanceSection /> : null}
					{active === "capabilities" ? <CapabilitiesSection /> : null}
					{active === "network" ? <NetworkSection /> : null}
					{active === "advanced" ? <AdvancedSection /> : null}
				</div>
			</main>
		</DensityProvider>
	);
}

function SectionCard({
	title,
	description,
	children,
}: {
	title: ReactNode;
	description?: ReactNode;
	children: ReactNode;
}) {
	// Flat section — no card chrome. The page surface + the SettingsTabs
	// strip already provide enough separation; a bordered, shadowed card
	// on top of the tinted main surface read as "card stuffed in a card."
	return (
		<section>
			<header className="mb-4 flex flex-col gap-1">
				<h2 className="font-medium text-base">{title}</h2>
				{description ? <p className="text-base-content/60 text-sm">{description}</p> : null}
			</header>
			{children}
		</section>
	);
}

function Row({ label, hint, children }: { label: ReactNode; hint?: ReactNode; children: ReactNode }) {
	return (
		<div className="flex items-center justify-between gap-4 py-2">
			<div className="flex min-w-0 flex-col">
				<span className="text-base-content/90 text-sm">{label}</span>
				{hint ? <span className="text-base-content/60 text-xs">{hint}</span> : null}
			</div>
			<div className="shrink-0">{children}</div>
		</div>
	);
}

function GeneralSection() {
	const { t, i18n } = useTranslation();
	const activeLang = LANG_ITEMS.find((item) => item.id === i18n.resolvedLanguage)?.id ?? LANG_ITEMS[0]?.id ?? "en";

	const [theme, setTheme] = useState<ThemeChoice>(() => {
		const stored = typeof window !== "undefined" ? window.localStorage.getItem("soma.theme") : null;
		if (stored === "light" || stored === "dark" || stored === "system") return stored;
		return "system";
	});
	useEffect(() => {
		if (typeof window === "undefined") return;
		window.localStorage.setItem("soma.theme", theme);
		// TODO(theme): wire to the eventual ThemeProvider; today we set
		// daisyUI's `data-theme` on <html> so the toggle is at least
		// visible at runtime.
		const root = document.documentElement;
		if (theme === "system") root.removeAttribute("data-theme");
		else root.setAttribute("data-theme", theme === "dark" ? "luxury" : "winter");
	}, [theme]);

	const themeItems: ReadonlyArray<SwitcherItem> = useMemo(
		() => [
			{ id: "light", label: t("settings.general.theme.light") },
			{ id: "dark", label: t("settings.general.theme.dark") },
			{
				id: "system",
				label: t("settings.general.theme.system"),
				trailing: <Pill tone="info">{t("settings.general.theme.default")}</Pill>,
			},
		],
		[t],
	);

	return (
		<SectionCard description={t("settings.general.description")} title={t("settings.tabs.general")}>
			<div className="flex flex-col divide-y divide-base-300/60">
				<Row hint={t("settings.general.language.hint")} label={t("settings.general.language.label")}>
					<Switcher
						activeId={activeLang}
						items={LANG_ITEMS}
						onChange={(id) => {
							void i18n.changeLanguage(id);
						}}
						placement="bottom-end"
						triggerAriaLabel={t("settings.general.language.label")}
					/>
				</Row>
				<Row hint={t("settings.general.theme.hint")} label={t("settings.general.theme.label")}>
					<Switcher
						activeId={theme}
						items={themeItems}
						onChange={(id) => setTheme(id as ThemeChoice)}
						placement="bottom-end"
						triggerAriaLabel={t("settings.general.theme.label")}
					/>
				</Row>
				<Row hint={t("settings.general.shortcuts.hint")} label={t("settings.general.shortcuts.label")}>
					<span className="inline-flex items-center gap-2 text-base-content/70 text-xs">
						<Kbd>⌘,</Kbd>
						<span>{t("settings.general.shortcuts.open")}</span>
					</span>
				</Row>
			</div>
		</SectionCard>
	);
}

function AccountSection() {
	const { t } = useTranslation();
	const [status, setStatus] = useState<DaemonStatus | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [copied, setCopied] = useState(false);

	useEffect(() => {
		let cancelled = false;
		(async () => {
			try {
				const next = await backend.daemon.status();
				if (!cancelled) setStatus(next);
			} catch (err) {
				if (!cancelled) setError(err instanceof Error ? err.message : String(err));
			}
		})();
		return () => {
			cancelled = true;
		};
	}, []);

	const peerId = status?.peerId ?? null;
	const truncated = peerId ? `${peerId.slice(0, 8)}…${peerId.slice(-6)}` : null;

	const copy = useCallback(() => {
		if (!peerId) return;
		navigator.clipboard.writeText(peerId).then(() => {
			setCopied(true);
			setTimeout(() => setCopied(false), 1500);
		});
	}, [peerId]);

	return (
		<SectionCard description={t("settings.account.description")} title={t("settings.tabs.account")}>
			{error ? (
				<Empty headline={t("settings.account.error")} subtext={error} />
			) : !status ? (
				<Empty headline={t("settings.account.loading")} variant="compact" />
			) : (
				<div className="flex flex-col gap-3">
					<Row hint={t("settings.account.peer_id.hint")} label={t("settings.account.peer_id.label")}>
						<div className="flex items-center gap-2">
							{truncated ? (
								<Pill tone="neutral">
									<span className="font-mono">{truncated}</span>
								</Pill>
							) : (
								<Pill tone="warning">{t("settings.account.peer_id.missing")}</Pill>
							)}
							<button className="btn btn-ghost btn-xs" disabled={!peerId} onClick={copy} type="button">
								{copied ? t("settings.account.peer_id.copied") : t("settings.account.peer_id.copy")}
							</button>
						</div>
					</Row>
					<Row label={t("settings.account.listen_addrs.label")}>
						<Pill tone={status.listenAddrs.length > 0 ? "success" : "neutral"}>
							{t("settings.account.listen_addrs.count", { count: status.listenAddrs.length })}
						</Pill>
					</Row>
					<Row label={t("settings.account.transport.label")}>
						<span className="font-mono text-base-content/70 text-xs">{status.socketPath}</span>
					</Row>
				</div>
			)}
		</SectionCard>
	);
}

function AppearanceSection() {
	const { t } = useTranslation();
	return (
		<SectionCard description={t("settings.appearance.description")} title={t("settings.tabs.appearance")}>
			<div className="grid gap-3 sm:grid-cols-2">
				<LauncherCard
					description={t("settings.appearance.theme.description")}
					title={t("settings.appearance.theme.title")}
				/>
				<LauncherCard
					badge={t("settings.appearance.density.badge")}
					description={t("settings.appearance.density.description")}
					title={t("settings.appearance.density.title")}
				/>
				<LauncherCard
					description={t("settings.appearance.accent.description")}
					title={t("settings.appearance.accent.title")}
				/>
			</div>
		</SectionCard>
	);
}

const DEMO_SCOPE_GROUPS: ScopeGroup[] = [
	{
		id: "documents",
		label: "Documents",
		scopes: [
			{ id: "docs.read", label: "Read documents" },
			{ id: "docs.write", label: "Edit documents" },
		],
	},
	{
		id: "messages",
		label: "Messages",
		scopes: [
			{ id: "msg.read", label: "Read messages" },
			{ id: "msg.write", label: "Send messages" },
		],
	},
];

function CapabilitiesSection() {
	const { t } = useTranslation();
	const [value, setValue] = useState<CapabilityFormValue>({
		alias: "",
		grantedScopeIds: [],
		expiryDate: null,
	});
	return (
		<SectionCard description={t("settings.capabilities.description")} title={t("settings.tabs.capabilities")}>
			<CapabilityForm
				onChange={setValue}
				onIssue={() => {
					// Stub action — wire to `backend.spaces.issueIssuerCapability`
					// once the space-picker lands.
					console.info("[settings] capability issue stub", value);
				}}
				peerId="12D3KooW…example"
				scopeGroups={DEMO_SCOPE_GROUPS}
				value={value}
			/>
		</SectionCard>
	);
}

function NetworkSection() {
	const { t } = useTranslation();
	const [address, setAddress] = useState("");
	const [preview, setPreview] = useState<PeerAddressValidation | null>(null);

	const validate = useCallback(() => {
		if (address.trim().length === 0) {
			setPreview(null);
			return;
		}
		if (address.includes("/p2p/")) {
			setPreview({ kind: "valid", peerId: address.split("/p2p/")[1] ?? address });
		} else {
			setPreview({ kind: "invalid", error: t("settings.network.peer.invalid") });
		}
	}, [address, t]);

	return (
		<SectionCard description={t("settings.network.description")} title={t("settings.tabs.network")}>
			<PeerAddressInput
				label={t("settings.network.peer.label")}
				onBlur={validate}
				onChange={setAddress}
				preview={preview}
				value={address}
			/>
		</SectionCard>
	);
}

function AdvancedSection() {
	const { t } = useTranslation();
	return (
		<SectionCard description={t("settings.advanced.description")} title={t("settings.tabs.advanced")}>
			<Empty
				cta={
					<button className="btn btn-ghost btn-sm" disabled type="button">
						{t("settings.advanced.cta")}
					</button>
				}
				headline={t("settings.advanced.coming_soon")}
			/>
		</SectionCard>
	);
}
