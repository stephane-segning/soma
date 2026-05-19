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
	useListNavigation,
	useRole,
} from "@floating-ui/react";
import { ChevronDown, Plus } from "react-feather";
import { useRef, useState } from "react";
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
	const [activeIndex, setActiveIndex] = useState<number | null>(null);

	const { refs, floatingStyles, context } = useFloating({
		open,
		onOpenChange: setOpen,
		middleware: [offset(6), flip(), shift({ padding: 8 })],
		placement: "top-start",
		whileElementsMounted: autoUpdate,
	});

	// One ref per row (backends + optional "Add backend…" footer).
	const listRef = useRef<Array<HTMLElement | null>>([]);

	const click = useClick(context, { enabled: !disabled });
	const dismiss = useDismiss(context);
	const role = useRole(context, { role: "listbox" });
	const listNav = useListNavigation(context, {
		listRef,
		activeIndex,
		onNavigate: setActiveIndex,
		// Loop the cursor; Enter selects via per-row onClick.
		loop: true,
	});
	const { getReferenceProps, getFloatingProps, getItemProps } = useInteractions([
		click,
		dismiss,
		role,
		listNav,
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
						{backends.map((backend, index) => {
							const isActive = backend.id === activeId;
							const isFocused = activeIndex === index;
							return (
								<li key={backend.id}>
									<button
										aria-selected={isActive}
										className={cn(
											// No `transition-colors` — see MenuItem for context.
											// Animating the row bg on hover/focus reads as the
											// row "growing in" as the user mouses through the list.
											"flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left text-ui-sm",
											isActive
												? "bg-primary/10 text-base-content"
												: isFocused
													? "bg-base-200 text-base-content"
													: "hover:bg-base-200",
										)}
										ref={(node) => {
											listRef.current[index] = node;
										}}
										role="option"
										tabIndex={isFocused ? 0 : -1}
										type="button"
										{...getItemProps({
											onClick: () => {
												onChange(backend.id);
												setOpen(false);
											},
										})}
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
								className={cn(
									// No `transition-colors` — row-list highlights must snap,
									// see MenuItem for context. The "Add backend…" footer is
									// part of the same list so it follows the same rule.
									"flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-ui-sm hover:bg-base-200 hover:text-base-content",
									activeIndex === backends.length
										? "bg-base-200 text-base-content"
										: "text-base-content/80",
								)}
								ref={(node) => {
									listRef.current[backends.length] = node;
								}}
								tabIndex={activeIndex === backends.length ? 0 : -1}
								type="button"
								{...getItemProps({
									onClick: () => {
										onAddBackend();
										setOpen(false);
									},
								})}
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
