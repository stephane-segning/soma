/**
 * SelectionBubble — single dark pill above a text selection.
 *
 * Locked by [refs editor §2](../../../../../docs/src/architecture/prd/ui-revamp-v0-refs-editor.md)
 * and [ADR-0005 §11](../../../../../docs/src/architecture/adrs/0005-ui-revamp-v0.md).
 *
 * Order: `<block-style ▾> · B · i · U · S · </> · link · highlight · comment · ⋯`
 * with dividers between block / inline / action clusters. The link
 * icon swaps the row into a single-input link mode in place.
 *
 * Trailing `Ask AI` chip per the ADR-0005 §11 amendment opens the
 * SelectionAIBar (the third editor surface).
 *
 * Positioning is the caller's job — the editor extension wraps this
 * in its own floating surface anchored above the selection.
 */
import {
	type FormEvent,
	type ReactNode,
	useEffect,
	useRef,
	useState,
} from "react";
import {
	Bold,
	Code,
	Italic,
	Link2,
	MessageSquare,
	MoreHorizontal,
	Star,
	Underline,
	X,
} from "react-feather";
import { useT } from "../../i18n/use-t";
import { cn } from "../../utils/cn";

export type BlockStyleOption = {
	id: string;
	label: string;
};

export type SelectionBubbleProps = {
	// Active format toggles (controlled).
	bold?: boolean;
	italic?: boolean;
	underline?: boolean;
	strike?: boolean;
	code?: boolean;
	highlight?: boolean;

	// Format toggle callbacks.
	onToggleBold?: () => void;
	onToggleItalic?: () => void;
	onToggleUnderline?: () => void;
	onToggleStrike?: () => void;
	onToggleCode?: () => void;
	onToggleHighlight?: () => void;

	// Block-style picker (leftmost dropdown).
	blockStyle?: BlockStyleOption;
	blockStyleOptions?: BlockStyleOption[];
	onChangeBlockStyle?: (id: string) => void;

	// Link.
	linkUrl?: string | null;
	/** Pass `null` to clear the link. */
	onSetLink?: (url: string | null) => void;
	/**
	 * Optional controlled state for the link-input mode. When provided
	 * (both props), the bubble switches into the link input form
	 * whenever `linkInputOpen` is true, regardless of whether the user
	 * clicked the internal link icon. Callers use this to wire the
	 * `Cmd+K` keyboard shortcut to the same link prompt the bubble
	 * already renders — without that, `Cmd+K` would have to invent its
	 * own input UI (which previously meant `window.prompt`, broken
	 * under Electron).
	 *
	 * If either prop is omitted, the bubble manages link mode locally
	 * (the internal link icon toggles it on, submit/cancel turns it
	 * off) — exactly as before.
	 */
	linkInputOpen?: boolean;
	onLinkInputOpenChange?: (open: boolean) => void;

	// Comment.
	onComment?: () => void;

	// AI chip (trailing).
	onAskAI?: () => void;

	// Overflow menu.
	onMore?: () => void;

	className?: string;
};

export function SelectionBubble(props: SelectionBubbleProps) {
	const t = useT();
	const [internalMode, setInternalMode] = useState<"format" | "link">("format");
	// When the controlled props are provided, mode tracks them; otherwise
	// it tracks internal state. This keeps existing callers (which don't
	// pass the controlled pair) on the old uncontrolled behaviour.
	const controlled =
		props.linkInputOpen !== undefined &&
		props.onLinkInputOpenChange !== undefined;
	const linkOpen = controlled
		? props.linkInputOpen === true
		: internalMode === "link";
	const setLinkOpen = (open: boolean) => {
		if (controlled) {
			props.onLinkInputOpenChange?.(open);
		} else {
			setInternalMode(open ? "link" : "format");
		}
	};

	if (linkOpen) {
		return (
			<LinkInputMode
				initialUrl={props.linkUrl ?? ""}
				onCancel={() => setLinkOpen(false)}
				onSubmit={(url) => {
					props.onSetLink?.(url.length > 0 ? url : null);
					setLinkOpen(false);
				}}
				className={props.className}
			/>
		);
	}

	return (
		<div
			className={cn(
				"glass-panel shadow-elevated inline-flex items-center gap-0.5 p-1",
				props.className,
			)}
			role="toolbar"
		>
			{props.blockStyleOptions && props.blockStyleOptions.length > 0 ? (
				<>
					<BlockStyleSelect
						active={props.blockStyle}
						onChange={props.onChangeBlockStyle}
						options={props.blockStyleOptions}
					/>
					<Divider />
				</>
			) : null}

			<ToolButton
				active={props.bold}
				label={t({ id: "selection-bubble.bold", defaultMessage: "Bold" })}
				onClick={props.onToggleBold}
			>
				<Bold aria-hidden className="size-3.5" />
			</ToolButton>
			<ToolButton
				active={props.italic}
				label={t({ id: "selection-bubble.italic", defaultMessage: "Italic" })}
				onClick={props.onToggleItalic}
			>
				<Italic aria-hidden className="size-3.5" />
			</ToolButton>
			<ToolButton
				active={props.underline}
				label={t({
					id: "selection-bubble.underline",
					defaultMessage: "Underline",
				})}
				onClick={props.onToggleUnderline}
			>
				<Underline aria-hidden className="size-3.5" />
			</ToolButton>
			<ToolButton
				active={props.strike}
				label={t({
					id: "selection-bubble.strike",
					defaultMessage: "Strikethrough",
				})}
				onClick={props.onToggleStrike}
			>
				<span
					aria-hidden
					className="inline-block font-semibold text-xs line-through"
				>
					S
				</span>
			</ToolButton>
			<ToolButton
				active={props.code}
				label={t({
					id: "selection-bubble.code",
					defaultMessage: "Inline code",
				})}
				onClick={props.onToggleCode}
			>
				<Code aria-hidden className="size-3.5" />
			</ToolButton>

			<Divider />

			<ToolButton
				active={Boolean(props.linkUrl)}
				label={t({ id: "selection-bubble.link", defaultMessage: "Link" })}
				onClick={() => setLinkOpen(true)}
			>
				<Link2 aria-hidden className="size-3.5" />
			</ToolButton>
			{props.onToggleHighlight ? (
				<ToolButton
					active={props.highlight}
					label={t({
						id: "selection-bubble.highlight",
						defaultMessage: "Highlight",
					})}
					onClick={props.onToggleHighlight}
				>
					<span
						aria-hidden
						className="inline-block size-3 rounded-sm bg-warning/60"
					/>
				</ToolButton>
			) : null}

			{props.onComment ? (
				<>
					<Divider />
					<ToolButton
						label={t({
							id: "selection-bubble.comment",
							defaultMessage: "Comment",
						})}
						onClick={props.onComment}
					>
						<MessageSquare aria-hidden className="size-3.5" />
					</ToolButton>
				</>
			) : null}

			{props.onAskAI ? (
				<>
					<Divider />
					<button
						aria-label={t({
							id: "selection-bubble.ask-ai",
							defaultMessage: "Ask AI",
						})}
						className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-info text-xs transition-colors hover:bg-info/10"
						onClick={props.onAskAI}
						type="button"
					>
						<Star aria-hidden className="size-3.5" />
						<span>
							{t({
								id: "selection-bubble.ask-ai-label",
								defaultMessage: "Ask AI",
							})}
						</span>
					</button>
				</>
			) : null}

			{props.onMore ? (
				<>
					<Divider />
					<ToolButton
						label={t({
							id: "selection-bubble.more",
							defaultMessage: "More options",
						})}
						onClick={props.onMore}
					>
						<MoreHorizontal aria-hidden className="size-3.5" />
					</ToolButton>
				</>
			) : null}
		</div>
	);
}

function Divider() {
	return <span aria-hidden className="mx-0.5 h-4 w-px bg-base-300" />;
}

function ToolButton({
	active,
	label,
	onClick,
	children,
}: {
	active?: boolean;
	label: string;
	onClick?: () => void;
	children: ReactNode;
}) {
	return (
		<button
			aria-label={label}
			aria-pressed={active}
			className={cn(
				"inline-flex size-7 items-center justify-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
				active
					? "bg-primary/15 text-primary"
					: "text-base-content/80 hover:bg-base-200 hover:text-base-content",
			)}
			onClick={onClick}
			title={label}
			type="button"
		>
			{children}
		</button>
	);
}

function BlockStyleSelect({
	options,
	active,
	onChange,
}: {
	options: BlockStyleOption[];
	active?: BlockStyleOption;
	onChange?: (id: string) => void;
}) {
	const t = useT();
	return (
		<select
			aria-label={t({
				id: "selection-bubble.block-style",
				defaultMessage: "Block style",
			})}
			className="rounded-md bg-transparent px-1.5 py-0.5 text-base-content/80 text-xs transition-colors hover:bg-base-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
			onChange={(event) => onChange?.(event.target.value)}
			value={active?.id ?? ""}
		>
			{options.map((option) => (
				<option key={option.id} value={option.id}>
					{option.label}
				</option>
			))}
		</select>
	);
}

function LinkInputMode({
	initialUrl,
	onCancel,
	onSubmit,
	className,
}: {
	initialUrl: string;
	onCancel: () => void;
	onSubmit: (url: string) => void;
	className?: string;
}) {
	const t = useT();
	const [value, setValue] = useState(initialUrl);
	const inputRef = useRef<HTMLInputElement | null>(null);
	useEffect(() => {
		inputRef.current?.focus();
		inputRef.current?.select();
	}, []);

	function handleSubmit(event: FormEvent) {
		event.preventDefault();
		const trimmed = value.trim();
		if (trimmed.length === 0) {
			// Empty input commits as "clear link".
			onSubmit("");
			return;
		}
		// Type="url" would force the user to type the protocol. Use text
		// and prefix `https://` ourselves when the input looks like a bare
		// domain (no scheme, no leading slash for in-app links).
		const hasScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed);
		const looksLikeRelativePath = trimmed.startsWith("/");
		const normalized =
			hasScheme || looksLikeRelativePath ? trimmed : `https://${trimmed}`;
		onSubmit(normalized);
	}

	return (
		<form
			className={cn(
				"glass-panel shadow-elevated inline-flex items-center gap-1 p-1",
				className,
			)}
			onSubmit={handleSubmit}
		>
			<Link2 aria-hidden className="ml-1 size-3.5 text-base-content/60" />
			<input
				className="min-w-0 bg-transparent px-1 py-0.5 text-sm outline-none placeholder:text-base-content/40"
				onChange={(event) => setValue(event.target.value)}
				onKeyDown={(event) => {
					if (event.key === "Escape") {
						event.preventDefault();
						onCancel();
					}
				}}
				placeholder={t({
					id: "selection-bubble.link-placeholder",
					defaultMessage: "Paste link…",
				})}
				ref={inputRef}
				type="text"
				value={value}
			/>
			<button
				aria-label={t({
					id: "selection-bubble.link-cancel",
					defaultMessage: "Cancel",
				})}
				className="inline-flex size-6 items-center justify-center rounded-md text-base-content/60 hover:bg-base-200 hover:text-base-content"
				onClick={onCancel}
				type="button"
			>
				<X aria-hidden className="size-3.5" />
			</button>
		</form>
	);
}
