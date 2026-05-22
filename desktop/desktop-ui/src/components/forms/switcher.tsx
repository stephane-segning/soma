/**
 * Switcher — generic, floating-ui-backed dropdown picker.
 *
 * The visual + interaction template that `BackendSwitcher` originally
 * carried in-line. Extracted here so the same chip-style trigger +
 * keyboard-navigable list + optional footer-action pattern can host any
 * single-select picker (models, themes, workspaces, …) without each
 * caller re-implementing `useFloating` + `useListNavigation` + the
 * MenuShell-style row styling.
 *
 * Library contract (the four pillars):
 * - **@floating-ui/react** for placement, dismiss, role, and list
 *   navigation. `useListNavigation` loops the cursor.
 * - **daisyUI** badges / kbd / btn classes everywhere a primitive
 *   already exists; row backgrounds use semantic `base-*` tokens.
 * - **tailwindcss v4** utilities, no hand-mixed hex colors.
 * - **motion** intentionally absent — the existing BackendSwitcher
 *   had no entry/exit animation and the design feedback was "I like
 *   how it looks." Opacity-only motion can be layered on later
 *   without changing the API.
 *
 * Row style follows the established "no transition-colors on list
 * rows" rule from `MenuShell` so hovering through the dropdown does
 * not produce a colour-fade wave.
 */
import {
	autoUpdate,
	flip,
	offset,
	type Placement,
	shift,
	useClick,
	useDismiss,
	useFloating,
	useInteractions,
	useListNavigation,
	useRole,
} from "@floating-ui/react";
import { type ReactNode, useRef, useState } from "react";
import { ChevronDown } from "react-feather";
import { cn } from "../../utils/cn";

export type SwitcherItem = {
	id: string;
	/** Primary text (or any node — keep it single-line). */
	label: ReactNode;
	/** Leading glyph / provider icon. Already sized by the caller. */
	mark?: ReactNode;
	/** Optional secondary text rendered under `label`. */
	subtitle?: ReactNode;
	/** Optional trailing slot — typically a `<Pill>` (e.g. "Default"). */
	trailing?: ReactNode;
};

export type SwitcherFooterAction = {
	label: ReactNode;
	icon?: ReactNode;
	onSelect: () => void;
};

export type SwitcherProps = {
	items: ReadonlyArray<SwitcherItem>;
	activeId: string | null;
	onChange: (id: string) => void;
	/** Accessible label for the trigger button. */
	triggerAriaLabel: string;
	/** Trigger text when no item is active. */
	emptyLabel?: ReactNode;
	/** Class names applied to the trigger button. */
	triggerClassName?: string;
	/** Optional footer action — renders a divider + button below the list. */
	footer?: SwitcherFooterAction;
	/** Floating placement. Defaults to `top-start`. */
	placement?: Placement;
	/** Tailwind width class for the dropdown panel. Defaults to `w-72`. */
	panelWidth?: string;
	disabled?: boolean;
};

export function Switcher({
	items,
	activeId,
	onChange,
	triggerAriaLabel,
	emptyLabel,
	triggerClassName,
	footer,
	placement = "top-start",
	panelWidth = "w-72",
	disabled,
}: SwitcherProps) {
	const [open, setOpen] = useState(false);
	const [activeIndex, setActiveIndex] = useState<number | null>(null);

	const { refs, floatingStyles, context } = useFloating({
		open,
		onOpenChange: setOpen,
		middleware: [offset(6), flip(), shift({ padding: 8 })],
		placement,
		whileElementsMounted: autoUpdate,
	});

	// One slot per row (items + optional footer action).
	const listRef = useRef<Array<HTMLElement | null>>([]);

	const click = useClick(context, { enabled: !disabled });
	const dismiss = useDismiss(context);
	const role = useRole(context, { role: "listbox" });
	const listNav = useListNavigation(context, {
		listRef,
		activeIndex,
		onNavigate: setActiveIndex,
		loop: true,
	});
	const { getReferenceProps, getFloatingProps, getItemProps } = useInteractions([
		click,
		dismiss,
		role,
		listNav,
	]);

	const active = items.find((item) => item.id === activeId) ?? null;
	const footerIndex = items.length;

	return (
		<>
			<button
				aria-label={triggerAriaLabel}
				className={cn(
					"inline-flex items-center gap-1.5 rounded-md border border-base-300 bg-base-100 px-2 py-1 text-xs transition-colors hover:bg-base-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
					disabled && "cursor-not-allowed opacity-50",
					triggerClassName,
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
					{active?.label ?? emptyLabel}
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
					className={cn(
						"glass-panel shadow-elevated z-40 p-1",
						panelWidth,
					)}
					ref={refs.setFloating}
					style={floatingStyles}
					{...getFloatingProps()}
				>
					<ul className="flex flex-col gap-0.5">
						{items.map((item, index) => {
							const isActive = item.id === activeId;
							const isFocused = activeIndex === index;
							return (
								<li key={item.id}>
									<button
										aria-selected={isActive}
										className={cn(
											// No `transition-colors` — row-list highlights snap,
											// see MenuShell for the rationale.
											"flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left text-sm",
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
												onChange(item.id);
												setOpen(false);
											},
										})}
									>
										{item.mark ? (
											<span
												aria-hidden
												className="mt-0.5 shrink-0 text-base-content/70"
											>
												{item.mark}
											</span>
										) : null}
										<span className="flex min-w-0 flex-1 flex-col">
											<span className="flex items-center gap-1.5">
												<span className="truncate text-base-content/90">
													{item.label}
												</span>
												{item.trailing}
											</span>
											{item.subtitle ? (
												<span className="truncate text-base-content/60 text-xs">
													{item.subtitle}
												</span>
											) : null}
										</span>
									</button>
								</li>
							);
						})}
					</ul>
					{footer ? (
						<>
							<div
								aria-hidden
								className="my-1 border-base-300 border-t"
							/>
							<button
								className={cn(
									// Same "no transition-colors" rule — the footer action is
									// part of the same keyboard-navigable list.
									"flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-base-200 hover:text-base-content",
									activeIndex === footerIndex
										? "bg-base-200 text-base-content"
										: "text-base-content/80",
								)}
								ref={(node) => {
									listRef.current[footerIndex] = node;
								}}
								tabIndex={activeIndex === footerIndex ? 0 : -1}
								type="button"
								{...getItemProps({
									onClick: () => {
										footer.onSelect();
										setOpen(false);
									},
								})}
							>
								{footer.icon ? (
									<span aria-hidden className="shrink-0">
										{footer.icon}
									</span>
								) : null}
								{footer.label}
							</button>
						</>
					) : null}
				</div>
			) : null}
		</>
	);
}
