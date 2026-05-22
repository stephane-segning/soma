/**
 * BackendSwitcher — chip in the chat composer footer (and the app
 * header) that picks the active ACP backend for the next message.
 *
 * Locked by [ADR-0005 §5](../../../../../docs/src/architecture/adrs/0005-ui-revamp-v0.md)
 * and [refs main §5](../../../../../docs/src/architecture/prd/ui-revamp-v0-refs.md):
 * a small `<provider-mark> <name> ↕` chip opening a dropdown listing
 * configured backends with an `Add backend…` footer that deep-links to
 * the Assistant settings tab.
 *
 * **A "backend" is `{provider × model × connection}`** — e.g. the same
 * `llama3.3` can appear twice, once through an Ollama transport and
 * once through OpenRouter. That's why the user-visible label includes
 * the provider mark + transport URL subtitle, and why the component is
 * not called `ModelSwitcher`. Functionally, end-users will still read
 * this as "pick which AI" — the technical name preserves the bundle
 * distinction.
 *
 * Implementation note: the visual + interaction template lives in the
 * generic `Switcher` primitive (`forms/switcher.tsx`). This file is
 * now a thin adapter that maps `BackendOption[]` onto `SwitcherItem[]`
 * and wires the i18n strings.
 */
import type { ReactNode } from "react";
import { Plus } from "react-feather";
import { useT } from "../../i18n/use-t";
import { Switcher, type SwitcherItem } from "../forms/switcher";
import { Pill } from "../primitives/pill";

export type BackendOption = {
	id: string;
	/** Visible name (e.g. "Ollama · llama3.3"). */
	name: string;
	/** Provider mark — 12–16px logo / icon. */
	mark?: ReactNode;
	/** Single-line subtext under the name (e.g. transport URL). */
	meta?: string;
	/** Whether this backend is the space-level default. */
	isDefault?: boolean;
};

export type BackendSwitcherProps = {
	backends: BackendOption[];
	activeId: string | null;
	onChange: (id: string) => void;
	/** Optional deep-link to the Assistant settings tab. */
	onAddBackend?: () => void;
	disabled?: boolean;
	className?: string;
};

export function BackendSwitcher({
	backends,
	activeId,
	onChange,
	onAddBackend,
	disabled,
	className,
}: BackendSwitcherProps) {
	const t = useT();

	const items: SwitcherItem[] = backends.map((backend) => ({
		id: backend.id,
		label: backend.name,
		mark: backend.mark,
		subtitle: backend.meta,
		trailing: backend.isDefault ? (
			<Pill tone="info">
				{t({
					id: "backend-switcher.default",
					defaultMessage: "Default",
				})}
			</Pill>
		) : null,
	}));

	return (
		<Switcher
			activeId={activeId}
			disabled={disabled}
			emptyLabel={t({
				id: "backend-switcher.empty",
				defaultMessage: "No backend",
			})}
			footer={
				onAddBackend
					? {
							icon: <Plus aria-hidden className="size-3.5" />,
							label: t({
								id: "backend-switcher.add",
								defaultMessage: "Add backend…",
							}),
							onSelect: onAddBackend,
						}
					: undefined
			}
			items={items}
			onChange={onChange}
			triggerAriaLabel={t({
				id: "backend-switcher.trigger",
				defaultMessage: "Switch backend",
			})}
			triggerClassName={className}
		/>
	);
}
