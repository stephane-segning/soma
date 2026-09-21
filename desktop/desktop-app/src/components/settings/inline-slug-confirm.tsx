/**
 * InlineSlugConfirm — the destructive-action confirm surface locked by
 * ADR-0005 §3: "Destructive actions open an inline slug-confirm form; the
 * action stays disabled until the typed slug matches." Never a modal.
 *
 * Shared by the Members tab (revoke member) and Bots tab (revoke bot) in
 * `spaces/:spaceId/settings` — both destructive, both need the same
 * friction — rather than forking two near-identical inline forms.
 *
 * Failure renders inline via `error` (ADR-0005 §6 — no toast for primary
 * action failures); the caller owns the request lifecycle (`busy`) and
 * decides when to unmount this on success.
 */
import { PolymorphButton } from "@soma/ui/components/actions/polymorph-button";
import { type ReactNode, useId, useState } from "react";
import { slugMatches } from "../../lib/space-settings";

export type InlineSlugConfirmProps = {
	title: ReactNode;
	description?: ReactNode;
	/** The exact string the user must retype to arm the confirm button. */
	expectedSlug: string;
	/** e.g. `Type {slug} to confirm` — caller supplies the translated copy. */
	slugLabel: ReactNode;
	confirmLabel: ReactNode;
	cancelLabel: ReactNode;
	busy?: boolean;
	error?: string | null;
	onConfirm: () => void;
	onCancel: () => void;
};

export function InlineSlugConfirm({
	title,
	description,
	expectedSlug,
	slugLabel,
	confirmLabel,
	cancelLabel,
	busy,
	error,
	onConfirm,
	onCancel,
}: InlineSlugConfirmProps) {
	const [typed, setTyped] = useState("");
	const inputId = useId();
	const matches = slugMatches(typed, expectedSlug);

	return (
		<form
			className="flex flex-col gap-3 rounded-md border border-error/40 bg-error/5 p-3"
			onSubmit={(event) => {
				event.preventDefault();
				if (matches && !busy) onConfirm();
			}}
		>
			<div className="flex flex-col gap-1">
				<h4 className="font-medium text-error text-sm">{title}</h4>
				{description ? <p className="text-base-content/70 text-xs">{description}</p> : null}
			</div>

			<div className="flex flex-col gap-1">
				<label className="text-base-content/70 text-xs" htmlFor={inputId}>
					{slugLabel}
				</label>
				<input
					autoComplete="off"
					className="w-full rounded-md border border-base-300 bg-base-100 px-2 py-1.5 font-mono text-sm outline-none focus-visible:border-error focus-visible:ring-1 focus-visible:ring-error/40"
					disabled={busy}
					id={inputId}
					onChange={(event) => setTyped(event.target.value)}
					placeholder={expectedSlug}
					spellCheck={false}
					type="text"
					value={typed}
				/>
			</div>

			{error ? <p className="text-error text-xs">{error}</p> : null}

			<div className="flex items-center justify-end gap-2">
				<PolymorphButton disabled={busy} onClick={onCancel} size="sm" type="button" variant="ghost">
					{cancelLabel}
				</PolymorphButton>
				<PolymorphButton disabled={!matches || busy} loading={busy} size="sm" type="submit" variant="danger">
					{confirmLabel}
				</PolymorphButton>
			</div>
		</form>
	);
}
