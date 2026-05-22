/**
 * SelectionAIBar — popover above an active selection, the
 * v0 surface for inline AI content transformations.
 *
 * Locked by [refs editor-ai §1](../../../../../docs/src/architecture/prd/ui-revamp-v0-refs-editor-ai.md)
 * and [ADR-0005 §13](../../../../../docs/src/architecture/adrs/0005-ui-revamp-v0.md).
 *
 * Top row = text input "Ask AI to edit or transform…". Body = locked
 * category-ordered action list pulled from a {@link NodeAIRegistry}
 * (the in-memory registry from Wave 1B; the TipTap-backed one ships
 * in Wave 4). Free-text input bypasses the action list and dispatches
 * as a custom prompt.
 *
 * Positioning is the caller's job — the editor extension wraps this
 * in its own floating surface anchored above the selection.
 */
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Star } from "react-feather";
import { useT } from "../../i18n/use-t";
import { cn } from "../../utils/cn";
import { MenuItem, MenuSectionLabel } from "../overlays/menu-shell";
import type {
	NodeAIAction,
	NodeAIActionCategory,
	NodeAIRegistry,
} from "./node-ai-registry.types";

export type SelectionAIBarProps = {
	registry: NodeAIRegistry;
	nodeType: string;
	selectedText: string;
	onClose: () => void;
	/**
	 * Called when the user types a custom prompt and presses Enter
	 * with no action highlighted. Receives the raw prompt text.
	 */
	onCustomPrompt?: (prompt: string) => void;
	/**
	 * Optional per-invocation metadata forwarded into each action's
	 * `run({ ..., metadata })` call. Callers use this to carry the
	 * selection range (`from` / `to`) or other host-specific context
	 * that the action body needs to mutate the document.
	 */
	metadata?: Record<string, unknown>;
	className?: string;
};

const CATEGORY_ORDER: NodeAIActionCategory[] = [
	"rewrite",
	"modify",
	"tone",
	"transform",
	"translate",
	"node",
	"custom",
];

export function SelectionAIBar({
	registry,
	nodeType,
	selectedText,
	onClose,
	onCustomPrompt,
	metadata,
	className,
}: SelectionAIBarProps) {
	const t = useT();
	const [prompt, setPrompt] = useState("");
	const containerRef = useRef<HTMLDivElement | null>(null);

	const sectionLabel: Record<NodeAIActionCategory, string> = {
		rewrite: t({
			id: "selection-ai.section.rewrite",
			defaultMessage: "Rewrite",
		}),
		modify: t({ id: "selection-ai.section.modify", defaultMessage: "Modify" }),
		tone: t({ id: "selection-ai.section.tone", defaultMessage: "Tone" }),
		transform: t({
			id: "selection-ai.section.transform",
			defaultMessage: "Transform",
		}),
		translate: t({
			id: "selection-ai.section.translate",
			defaultMessage: "Translate",
		}),
		node: t({ id: "selection-ai.section.node", defaultMessage: "Node" }),
		custom: t({ id: "selection-ai.section.custom", defaultMessage: "Custom" }),
	};

	const actions = useMemo(
		() => registry.resolve(nodeType, "selection"),
		[registry, nodeType],
	);

	const grouped = useMemo(() => {
		const lower = prompt.toLowerCase();
		const visible = actions.filter((action) => {
			if (lower.length === 0) return true;
			return (
				action.label.toLowerCase().includes(lower) ||
				action.description?.toLowerCase().includes(lower)
			);
		});
		const buckets = new Map<NodeAIActionCategory, NodeAIAction[]>();
		for (const category of CATEGORY_ORDER) buckets.set(category, []);
		for (const action of visible) buckets.get(action.category)?.push(action);
		return CATEGORY_ORDER.map((category) => ({
			category,
			items: buckets.get(category) ?? [],
		})).filter((g) => g.items.length > 0);
	}, [actions, prompt]);

	const flat = useMemo(() => grouped.flatMap((g) => g.items), [grouped]);

	const [activeIndex, setActiveIndex] = useState(0);
	useEffect(() => {
		setActiveIndex(0);
	}, [flat]);

	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			// Escape is a modal-style dismissal — fires regardless of where
			// focus currently sits. Arrow/Enter are gated on focus living
			// inside this instance so two simultaneous AI bars wouldn't
			// trade keystrokes.
			if (event.key === "Escape") {
				event.preventDefault();
				onClose();
				return;
			}
			const target = event.target;
			if (!(target instanceof Node)) return;
			if (!containerRef.current?.contains(target)) return;
			if (event.key === "ArrowDown") {
				event.preventDefault();
				setActiveIndex((idx) =>
					flat.length === 0 ? 0 : (idx + 1) % flat.length,
				);
			} else if (event.key === "ArrowUp") {
				event.preventDefault();
				setActiveIndex((idx) =>
					flat.length === 0 ? 0 : (idx - 1 + flat.length) % flat.length,
				);
			} else if (event.key === "Enter") {
				event.preventDefault();
				if (flat.length > 0) {
					const action = flat[activeIndex];
					action?.run({
						nodeType,
						text: selectedText,
						surface: "selection",
						metadata,
					});
				} else if (onCustomPrompt && prompt.trim().length > 0) {
					onCustomPrompt(prompt.trim());
				}
			}
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [
		flat,
		activeIndex,
		nodeType,
		selectedText,
		prompt,
		onClose,
		onCustomPrompt,
	]);

	// Click-outside dismissal. Listen on `mousedown` (not click) so we
	// close before the editor blurs the bar's input on a second click,
	// and capture phase so it fires before any inner stop-propagation.
	useEffect(() => {
		const onMouseDown = (event: MouseEvent) => {
			const target = event.target;
			if (!(target instanceof Node)) return;
			if (containerRef.current?.contains(target)) return;
			onClose();
		};
		document.addEventListener("mousedown", onMouseDown, true);
		return () => document.removeEventListener("mousedown", onMouseDown, true);
	}, [onClose]);

	return (
		<div
			aria-label={t({
				id: "selection-ai.dialog-label",
				defaultMessage: "Ask AI",
			})}
			aria-modal="true"
			className={cn(
				"glass-panel shadow-elevated w-96 flex flex-col gap-1 p-1",
				className,
			)}
			ref={containerRef}
			role="dialog"
		>
			<div className="flex items-center gap-2 rounded-md bg-base-100 px-2 py-1.5">
				<Star aria-hidden className="size-4 shrink-0 text-info" />
				<input
					autoFocus
					className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-base-content/40"
					onChange={(event) => setPrompt(event.target.value)}
					placeholder={t({
						id: "selection-ai.prompt-placeholder",
						defaultMessage: "Ask AI to edit or transform…",
					})}
					type="text"
					value={prompt}
				/>
			</div>

			{flat.length === 0 ? (
				<div className="px-2 py-2 text-base-content/60 text-sm">
					{onCustomPrompt && prompt.trim().length > 0
						? t({
								id: "selection-ai.dispatch-custom",
								defaultMessage: "Press ↵ to dispatch as a custom prompt",
							})
						: t({
								id: "selection-ai.no-actions",
								defaultMessage: "No matching actions",
							})}
				</div>
			) : (
				<ActionList
					grouped={grouped}
					activeIndex={activeIndex}
					setActiveIndex={setActiveIndex}
					sectionLabel={sectionLabel}
					nodeType={nodeType}
					selectedText={selectedText}
					metadata={metadata}
				/>
			)}
		</div>
	);
}

function ActionList({
	grouped,
	activeIndex,
	setActiveIndex,
	sectionLabel,
	nodeType,
	selectedText,
	metadata,
}: {
	grouped: { category: NodeAIActionCategory; items: NodeAIAction[] }[];
	activeIndex: number;
	setActiveIndex: (idx: number) => void;
	sectionLabel: Record<NodeAIActionCategory, ReactNode>;
	nodeType: string;
	selectedText: string;
	metadata?: Record<string, unknown>;
}) {
	let runningIndex = 0;
	return (
		<div className="flex max-h-72 flex-col gap-1 overflow-y-auto">
			{grouped.map((group) => (
				<div className="flex flex-col gap-0.5" key={group.category}>
					<MenuSectionLabel>{sectionLabel[group.category]}</MenuSectionLabel>
					{group.items.map((action) => {
						const isActive = runningIndex === activeIndex;
						const ownIndex = runningIndex;
						runningIndex += 1;
						return (
							<MenuItem
								active={isActive}
								key={action.id}
								label={action.label}
								onClick={() =>
									action.run({
										nodeType,
										text: selectedText,
										surface: "selection",
										metadata,
									})
								}
								onMouseEnter={() => setActiveIndex(ownIndex)}
								role="option"
								shortcut={action.shortcut}
							/>
						);
					})}
				</div>
			))}
		</div>
	);
}
