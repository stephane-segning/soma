/**
 * MenuShell + MenuItem — shared primitives for popover-style menus.
 *
 * Locks the visual contract for slash menu, action menu's add popover,
 * selection AI bar, and any future floating list. Before these existed,
 * every menu re-defined padding, border radius, row hover, and icon
 * column — and the resulting menus drifted into separate visual
 * families. Anything reaching for a `glass-panel`-flavored popover
 * with a vertical list of selectable items should use these.
 *
 * Not intended for horizontal toolbars (SelectionBubble) or chat-style
 * surfaces — those have different visual requirements.
 */
import {
	type ButtonHTMLAttributes,
	forwardRef,
	type HTMLAttributes,
	type ReactNode,
} from "react";
import { cn } from "../../utils/cn";
import { Kbd } from "../primitives/kbd";

export type MenuShellProps = HTMLAttributes<HTMLDivElement> & {
	/**
	 * Optional override for the shell width. Defaults to `min-w-48` so the
	 * shell hugs its contents on short menus; passing e.g. `"w-80"` is the
	 * standard "list with section headers" width.
	 */
	width?: string;
};

/**
 * Popover shell: glass-panel + elevated shadow + consistent padding.
 * Renders as a `<div role="menu">` by default; callers can override the
 * role for `listbox` etc. via the spread `role` prop.
 */
export const MenuShell = forwardRef<HTMLDivElement, MenuShellProps>(
	function MenuShell(
		{ className, width = "min-w-48", role = "menu", ...rest },
		ref,
	) {
		return (
			<div
				className={cn(
					"glass-panel flex flex-col gap-0.5 p-1 shadow-elevated",
					width,
					className,
				)}
				ref={ref}
				role={role}
				{...rest}
			/>
		);
	},
);

export type MenuItemTone = "default" | "danger";

export type MenuItemProps = Omit<
	ButtonHTMLAttributes<HTMLButtonElement>,
	"children"
> & {
	label: ReactNode;
	icon?: ReactNode;
	shortcut?: ReactNode;
	tone?: MenuItemTone;
	/** Visual "highlighted by keyboard nav" state. */
	active?: boolean;
};

/**
 * Single row inside a MenuShell. Icon + label + optional shortcut hint.
 * Standardizes row height, hover, and active state so menus look like
 * siblings even when their list contents diverge.
 */
export const MenuItem = forwardRef<HTMLButtonElement, MenuItemProps>(
	function MenuItem(
		{
			label,
			icon,
			shortcut,
			tone = "default",
			active = false,
			className,
			disabled,
			role,
			...rest
		},
		ref,
	) {
		const isDanger = tone === "danger";
		const rowClassName = cn(
			"flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm",
			disabled && "cursor-not-allowed opacity-50",
			!disabled && active && !isDanger && "bg-base-200 text-base-content",
			!disabled && active && isDanger && "bg-error text-error-content",
			!disabled && !active && !isDanger && "hover:bg-base-200",
			!disabled &&
				!active &&
				isDanger &&
				"hover:bg-error hover:text-error-content",
			className,
		);
		const rowChildren = (
			<>
				{icon != null ? (
					<span
						aria-hidden
						className="inline-flex size-4 shrink-0 items-center justify-center text-base-content/60"
					>
						{icon}
					</span>
				) : null}
				<span className="min-w-0 flex-1 truncate">{label}</span>
				{shortcut != null ? (
					// Render the shortcut hint through `Kbd` so every menu's
					// shortcut text shares the same key-cap visual instead of
					// each surface inventing its own font-mono styling.
					<Kbd className="shrink-0" size="xs">
						{shortcut}
					</Kbd>
				) : null}
			</>
		);

		// `aria-selected` is only a valid ARIA prop on option/tab/row-like
		// roles, never on the implicit "button" role — biome (rightly)
		// checks this against a literal `role`, so it can't be resolved
		// through a caller-supplied prop. MenuItem is shared by two
		// surfaces: true command menus (ContextMenu, via MenuShell's default
		// `role="menu"`) which never pass `role` or `active` here, and
		// searchable listbox-style pickers (SlashMenu, SelectionAIBar,
		// MentionPicker) which explicitly pass `role="option"` and use
		// `active` as the keyboard-roving highlight. Branch on the resolved
		// role so `aria-selected` only ever appears paired with a literal,
		// compatible role.
		if (role === "option") {
			return (
				<button
					aria-selected={active || undefined}
					className={rowClassName}
					disabled={disabled}
					ref={ref}
					role="option"
					type="button"
					{...rest}
				>
					{rowChildren}
				</button>
			);
		}
		return (
			<button
				className={rowClassName}
				disabled={disabled}
				ref={ref}
				role={role}
				// No transition on hover/active state. A 150ms colour fade on each
				// row reads as the row "growing in" when the user moves the
				// mouse over a menu — bg-color animating from transparent →
				// base-200 across a sequence of hovered items looks like a wave
				// of scaling. Snap the highlight instantly instead; the cursor
				// motion itself supplies all the feedback we need.
				type="button"
				{...rest}
			>
				{rowChildren}
			</button>
		);
	},
);

/**
 * Small uppercase section header used to group items inside a MenuShell.
 */
export function MenuSectionLabel({ children }: { children: ReactNode }) {
	return (
		<div className="px-2 pt-1 text-base-content/50 text-xs uppercase tracking-wide">
			{children}
		</div>
	);
}
