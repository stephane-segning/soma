/**
 * SecretInput — single-line input for a write-only secret (API keys,
 * tokens). Locked by [refs assistant-bots §1](../../../../../docs/src/architecture/prd/ui-revamp-v0-refs-assistant-bots.md):
 * "always `type=password` with a reveal toggle on the right edge... do
 * not invent one" — this is that primitive.
 *
 * Renders as `type="password"` by default; the trailing eye/eye-off
 * button toggles `type="text"` so the user can proof-read what they
 * typed before it's saved. Purely a display concern — `SecretInput`
 * never knows whether the caller's backend already has a stored value,
 * what "unchanged" vs "clear" means, or anything else about the
 * surrounding save semantics. Callers own all of that (see
 * `desktop-app`'s `assistant-config.ts` for the space/default-provider
 * form that consumes this) and pass whatever `placeholder` fits — e.g.
 * "Unchanged — leave blank to keep the current key" when a value is
 * already stored server-side.
 *
 * Controlled, like every other form primitive here: caller owns `value`
 * + `onChange`.
 */
import { type ChangeEvent, type ReactNode, useId, useState } from "react";
import { Eye, EyeOff } from "react-feather";
import { useT } from "../../i18n/use-t";
import { cn } from "../../utils/cn";

export type SecretInputProps = {
	value: string;
	onChange: (next: string) => void;
	onBlur?: () => void;
	disabled?: boolean;
	placeholder?: string;
	className?: string;
	/** Optional label rendered above the field. Pass a translated string for i18n, or any other ReactNode. */
	label?: ReactNode;
};

export function SecretInput({ value, onChange, onBlur, disabled, placeholder, className, label }: SecretInputProps) {
	const t = useT();
	const [revealed, setRevealed] = useState(false);
	const inputId = useId();
	const handleChange = (event: ChangeEvent<HTMLInputElement>) => onChange(event.target.value);

	return (
		<div className={cn("flex flex-col gap-2", className)}>
			{label ? (
				<label className="text-base-content/80 text-sm" htmlFor={inputId}>
					{label}
				</label>
			) : null}
			<div className="relative">
				<input
					autoComplete="off"
					className="w-full rounded-md border border-base-300 bg-base-100 py-2 pr-9 pl-3 font-mono text-sm outline-none transition-colors focus-visible:border-primary focus-visible:ring-1 focus-visible:ring-primary/40"
					disabled={disabled}
					id={inputId}
					onBlur={onBlur}
					onChange={handleChange}
					placeholder={placeholder}
					spellCheck={false}
					type={revealed ? "text" : "password"}
					value={value}
				/>
				<button
					aria-label={
						revealed
							? t({ id: "secret-input.hide", defaultMessage: "Hide" })
							: t({ id: "secret-input.show", defaultMessage: "Show" })
					}
					aria-pressed={revealed}
					className="absolute top-1/2 right-1.5 grid size-6 -translate-y-1/2 place-items-center rounded text-base-content/55 hover:bg-base-200 hover:text-base-content"
					disabled={disabled}
					onClick={() => setRevealed((prev) => !prev)}
					type="button"
				>
					{revealed ? <EyeOff aria-hidden className="size-3.5" /> : <Eye aria-hidden className="size-3.5" />}
				</button>
			</div>
		</div>
	);
}
