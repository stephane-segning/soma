/**
 * PeerAddressInput — single oversized monospace input used in the
 * space settings Bots tab to paste a bot's peer address.
 *
 * Locked by ADR-0005 §4 and refs at
 * [refs main §4](../../../../../docs/src/architecture/prd/ui-revamp-v0-refs.md).
 *
 * Validation is **controlled** — the caller decides when to run it
 * (typically on blur) and passes the result via `preview`. The
 * component renders the success preview or error inline. No toast.
 */
import { type ChangeEvent, type ReactNode, useId } from "react";
import { AlertCircle, CheckCircle } from "react-feather";
import { useT } from "../../i18n/use-t";
import { cn } from "../../utils/cn";

export type PeerAddressValidation =
	| { kind: "valid"; peerId: string; alias?: string }
	| { kind: "invalid"; error: string };

export type PeerAddressInputProps = {
	value: string;
	onChange: (next: string) => void;
	onBlur?: () => void;
	/**
	 * Validation result. `null` (or omitted) means "not yet validated"
	 * — no preview, no error. Callers typically set this on blur after
	 * running their own validator (sync or async).
	 */
	preview?: PeerAddressValidation | null;
	disabled?: boolean;
	autoFocus?: boolean;
	placeholder?: string;
	className?: string;
	/**
	 * Optional label rendered above the field. Pass a translated string
	 * (`t({...})`) for i18n, or any other ReactNode.
	 */
	label?: ReactNode;
};

export function PeerAddressInput({
	value,
	onChange,
	onBlur,
	preview,
	disabled,
	autoFocus,
	placeholder,
	className,
	label,
}: PeerAddressInputProps) {
	const t = useT();
	const handleChange = (event: ChangeEvent<HTMLInputElement>) =>
		onChange(event.target.value);

	const inputId = useId();

	return (
		<div className={cn("flex flex-col gap-2", className)}>
			{label ? (
				<label className="text-ui-sm text-base-content/80" htmlFor={inputId}>
					{label}
				</label>
			) : null}
			<input
				aria-invalid={preview?.kind === "invalid" || undefined}
				autoFocus={autoFocus}
				className={cn(
					"w-full rounded-md border bg-base-100 px-3 py-2 font-mono text-body outline-none transition-colors",
					"focus-visible:border-primary focus-visible:ring-1 focus-visible:ring-primary/40",
					preview?.kind === "invalid"
						? "border-error"
						: "border-base-300",
				)}
				disabled={disabled}
				id={inputId}
				onBlur={onBlur}
				onChange={handleChange}
				placeholder={
					placeholder ??
					t({
						id: "peer-address-input.placeholder",
						defaultMessage: "/ip4/.../tcp/.../p2p/<peer-id>",
					})
				}
				spellCheck={false}
				type="text"
				value={value}
			/>
			{preview ? <PreviewLine preview={preview} /> : null}
		</div>
	);
}

function PreviewLine({ preview }: { preview: PeerAddressValidation }) {
	const t = useT();
	if (preview.kind === "valid") {
		return (
			<div className="flex items-start gap-2 text-ui-sm">
				<CheckCircle aria-hidden className="mt-0.5 size-4 shrink-0 text-success" />
				<div className="flex min-w-0 flex-col">
					<span className="text-base-content/80">
						{t({
							id: "peer-address-input.preview.valid",
							defaultMessage: "Peer recognized",
						})}
					</span>
					<span className="break-all font-mono text-ui-xs text-base-content/60">
						{preview.peerId}
						{preview.alias ? ` · ${preview.alias}` : ""}
					</span>
				</div>
			</div>
		);
	}
	return (
		<div className="flex items-start gap-2 text-ui-sm">
			<AlertCircle aria-hidden className="mt-0.5 size-4 shrink-0 text-error" />
			<span className="text-error">{preview.error}</span>
		</div>
	);
}
