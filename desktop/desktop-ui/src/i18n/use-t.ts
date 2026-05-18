/**
 * useT — the per-component i18n hook. Wraps `react-intl`'s `useIntl()`
 * with a tighter, opinionated API that matches the scaffold's acceptance
 * criterion §4.7: "User-facing strings route through the i18n harness."
 *
 * Usage:
 *
 * ```tsx
 * const t = useT();
 * return <button>{t({ id: "bot-list.add", defaultMessage: "Add bot" })}</button>;
 * ```
 *
 * The `defaultMessage` is the source of truth at v0; a future locale
 * extractor harvests `id` + `defaultMessage` into per-locale catalogs.
 * Use ICU placeholders (`{count, plural, one {} other {}}`) where useful.
 */
import { useCallback } from "react";
import { useIntl } from "react-intl";

export type Translation = {
	id: string;
	defaultMessage: string;
	description?: string;
	values?: Record<string, string | number | boolean | null | undefined>;
};

export type TFn = (translation: Translation) => string;

export function useT(): TFn {
	const intl = useIntl();
	return useCallback<TFn>(
		({ id, defaultMessage, description, values }) =>
			intl.formatMessage({ id, defaultMessage, description }, values),
		[intl],
	);
}
