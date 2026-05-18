/**
 * IntlProvider wrapper — the i18n harness locked in
 * [ADR-0005 / scaffold §3 Wave 0](../../../../../docs/src/architecture/prd/ui-revamp-v0-scaffold.md).
 *
 * v0 ships English only. Every user-facing string in `@soma/ui` routes
 * through this harness so adding locales later is a config change, not
 * a refactor. See {@link useT} for the per-component hook.
 */
import { type ReactNode, useMemo } from "react";
import { IntlProvider as ReactIntlProvider } from "react-intl";

export type Locale = "en";

export const DEFAULT_LOCALE: Locale = "en";

export type SomaIntlProviderProps = {
	locale?: Locale;
	/**
	 * Optional override catalog. Mostly useful for Storybook + tests that
	 * want to assert a specific translation. Production callers leave this
	 * unset — the bundled English catalog is the source of truth.
	 */
	messages?: Record<string, string>;
	children: ReactNode;
};

export function SomaIntlProvider({
	locale = DEFAULT_LOCALE,
	messages,
	children,
}: SomaIntlProviderProps) {
	const resolvedMessages = useMemo(
		// In v0 the only locale is English, and every string ships its own
		// `defaultMessage` via `useT()` — so an empty messages map is fine.
		// The harness exists to lock the pattern; the catalog is opt-in.
		() => messages ?? {},
		[messages],
	);

	return (
		<ReactIntlProvider
			defaultLocale={DEFAULT_LOCALE}
			locale={locale}
			messages={resolvedMessages}
			// Silence the "missing translation" warning when the catalog is
			// empty and `defaultMessage` is the source of truth.
			onError={(err) => {
				if (err.code === "MISSING_TRANSLATION") return;
				// Re-emit anything that isn't an expected fallback so genuine
				// formatting errors still surface.
				console.error(err);
			}}
		>
			{children}
		</ReactIntlProvider>
	);
}
