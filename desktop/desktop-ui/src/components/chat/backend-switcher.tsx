/**
 * BackendSwitcher — chip that lives in the chat composer footer and
 * picks the active ACP backend for the next message.
 *
 * Locked by [ADR-0005 §5](../../../../../docs/src/architecture/adrs/0005-ui-revamp-v0.md)
 * and [refs main §5](../../../../../docs/src/architecture/prd/ui-revamp-v0-refs.md):
 * a small `<provider-mark> <name> ↕` chip in the composer footer
 * (NOT the chat header), opening a dropdown listing configured
 * backends with an `Add backend…` footer that deep-links to the
 * Assistant settings tab.
 *
 * Rebuild from `forms/ai-model-selector.tsx` per the audit. The old
 * component is left in place until a follow-up sweep deletes it
 * after the chat panel cutover.
 */
import {
	autoUpdate,
	flip,
	offset,
	shift,
	useClick,
	useDismiss,
	useFloating,
	useInteractions,
	useRole,
} from "@floating-ui/react";
import { ChevronDown, Plus } from "react-feather";
import { useState } from "react";
import { useT } from "../../i18n/use-t";
import { cn } from "../../utils/cn";
import { Pill } from "../primitives/pill";

export type BackendOption = {
	id: string;
	/** Visible name (e.g. "Ollama · llama3.3"). */
	name: string;
	/** Provider mark — 12–16px logo / icon. */
	mark?: React.ReactNode;
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
	const [open, setOpen] = useState(false);

	const { refs, floatingStyles, context } = useFloating({
		open,
		onOpenChange: setOpen,
		middleware: [offset(6), flip(), shift({ padding: 8 })],
		placement: "top-start",
		whileElementsMounted: autoUpdate,
	});

	const click = useClick(context, { enabled: !disabled });
	const dismiss = useDismiss(context);
	const role = useRole(context, { role: "listbox" });
	const { getReferenceProps, getFloatingProps } = useInteractions([
		click,
		dismiss,
		role,
	]);

	const active = backends.find((b) => b.id === activeId);

	return (
		<>
			<button
				aria-label={t({
					id: "backend-switcher.trigger",
					defaultMessage: "Switch backend",
				})}
				className={cn(
					"inline-flex items-center gap-1.5 rounded-md border border-base-300 bg-base-100 px-2 py-1 text-ui-xs transition-colors hover:bg-base-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
					disabled && "cursor-not-allowed opacity-50",
					className,
				)}
				disabled={disabled}
				ref={refs.setReference}
				type="button"
				{...getReferenceProps()}
			>
				{active?.mark ? (
					<span aria-hidden className="text-base-content/70">
						{active.mark}
					</span>
				) : null}
				<span className="text-base-content/90">
					{active?.name ??
						t({
							id: "backend-switcher.empty",
							defaultMessage: "No backend",
						})}
				</span>
				<ChevronDown
					aria-hidden
					className={cn(
						"size-3 text-base-content/60 transition-transform",
						open && "rotate-180",
					)}
				/>
			</button>
			{open ? (
				<div
					className="glass-panel shadow-elevated z-40 w-72 p-1"
					ref={refs.setFloating}
					style={floatingStyles}
					{...getFloatingProps()}
				>
					<ul className="flex flex-col gap-0.5">
						{backends.map((backend) => {
							const isActive = backend.id === activeId;
							return (
								<li key={backend.id}>
									<button
										aria-selected={isActive}
										className={cn(
											"flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left text-ui-sm transition-colors",
											isActive
												? "bg-primary/10 text-base-content"
												: "hover:bg-base-200",
										)}
										onClick={() => {
											onChange(backend.id);
											setOpen(false);
										}}
										role="option"
										type="button"
									>
										{backend.mark ? (
											<span
												aria-hidden
												className="mt-0.5 shrink-0 text-base-content/70"
											>
												{backend.mark}
											</span>
										) : null}
										<span className="flex min-w-0 flex-1 flex-col">
											<span className="flex items-center gap-1.5">
												<span className="truncate text-base-content/90">
													{backend.name}
												</span>
												{backend.isDefault ? (
													<Pill tone="info">
														{t({
															id: "backend-switcher.default",
															defaultMessage: "Default",
														})}
													</Pill>
												) : null}
											</span>
											{backend.meta ? (
												<span className="truncate text-base-content/60 text-ui-xs">
													{backend.meta}
												</span>
											) : null}
										</span>
									</button>
								</li>
							);
						})}
					</ul>
					{onAddBackend ? (
						<>
							<div
								aria-hidden
								className="my-1 border-base-300 border-t"
							/>
							<button
								className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-base-content/80 text-ui-sm transition-colors hover:bg-base-200 hover:text-base-content"
								onClick={() => {
									onAddBackend();
									setOpen(false);
								}}
								type="button"
							>
								<Plus aria-hidden className="size-3.5" />
								{t({
									id: "backend-switcher.add",
									defaultMessage: "Add backend…",
								})}
							</button>
						</>
					) : null}
				</div>
			) : null}
		</>
	);
}
