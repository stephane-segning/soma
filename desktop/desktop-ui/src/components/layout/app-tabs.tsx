/**
 * AppTabs — horizontal tab strip for documents / workspaces inside the
 * app. NOT OS window chrome.
 *
 * Renders a row of tabs at the top of the main column, in the same
 * spirit as browser or editor tabs (VS Code, Chrome). Each tab carries
 * an optional icon, a label, an optional dirty dot, and a close button
 * that becomes visible on hover. An optional `+` button at the end
 * fires `onNew`.
 *
 * **Drag-to-reorder.** When the caller provides an `onReorder`
 * callback, tabs become draggable left-to-right via `@dnd-kit/sortable`.
 * The pointer sensor uses a 5 px activation distance so a quick click
 * still selects the tab without starting a drag, and the close X stops
 * propagation so clicking it never grabs the tab. Reorder fires with
 * the new id order; the parent is the source of truth for the tabs
 * array.
 *
 * Motion contract:
 * - Active indicator slides between tabs via `layoutId`.
 * - Tabs fade in / out via `AnimatePresence` when the inventory changes.
 * - During a drag, dnd-kit owns `transform`; motion only touches
 *   `opacity` to dim the dragged tab, so the two libraries never fight.
 * - Opacity-only — no scale or translate — to satisfy
 *   `no-scale-animations.test.ts`.
 */
import {
	closestCenter,
	DndContext,
	type DragEndEvent,
	KeyboardSensor,
	PointerSensor,
	useSensor,
	useSensors,
} from "@dnd-kit/core";
import {
	horizontalListSortingStrategy,
	SortableContext,
	sortableKeyboardCoordinates,
	useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { AnimatePresence, motion } from "motion/react";
import type { CSSProperties, ReactNode } from "react";
import { Plus, X } from "react-feather";
import { cn } from "../../utils/cn";

export type AppTab = {
	id: string;
	title: string;
	/** Icon node (already sized — size-3.5 is the canonical caller). */
	icon?: ReactNode;
	/** Unsaved-changes dot. Shows a 6px circle to the left of close. */
	dirty?: boolean;
};

export type AppTabsProps = {
	tabs: ReadonlyArray<AppTab>;
	activeId?: string;
	onSelect?: (id: string) => void;
	onClose?: (id: string) => void;
	/** When set, renders a `+` button at the trailing edge of the strip. */
	onNew?: () => void;
	/**
	 * When set, tabs become draggable left-to-right. Fires with the new
	 * id order; the parent should mirror this into its `tabs` array.
	 */
	onReorder?: (nextIds: string[]) => void;
	className?: string;
	"aria-label"?: string;
};

export function AppTabs({
	tabs,
	activeId,
	onSelect,
	onClose,
	onNew,
	onReorder,
	className,
	"aria-label": ariaLabel = "Tabs",
}: AppTabsProps) {
	const dndEnabled = Boolean(onReorder);

	const sensors = useSensors(
		// 5 px activation distance — a stationary click on the tab still
		// fires `onSelect` cleanly; the user has to actually move the
		// pointer before drag activates.
		useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
		useSensor(KeyboardSensor, {
			coordinateGetter: sortableKeyboardCoordinates,
		}),
	);

	const handleDragEnd = (event: DragEndEvent) => {
		const { active, over } = event;
		if (!over || active.id === over.id || !onReorder) return;
		const ids = tabs.map((t) => t.id);
		const oldIndex = ids.indexOf(String(active.id));
		const newIndex = ids.indexOf(String(over.id));
		if (oldIndex < 0 || newIndex < 0) return;
		const next = [...ids];
		next.splice(oldIndex, 1);
		next.splice(newIndex, 0, String(active.id));
		onReorder(next);
	};

	const tabNodes = (
		<AnimatePresence initial={false}>
			{tabs.map((tab) => (
				<TabItem
					activeId={activeId}
					dndEnabled={dndEnabled}
					key={tab.id}
					onClose={onClose}
					onSelect={onSelect}
					tab={tab}
				/>
			))}
		</AnimatePresence>
	);

	return (
		<div
			aria-label={ariaLabel}
			className={cn(
				"flex items-center gap-1 border-base-300 border-b bg-base-100 px-2 pt-1",
				className,
			)}
			role="tablist"
		>
			<div className="scrollbar-none flex flex-1 items-center gap-0.5 overflow-x-auto">
				{dndEnabled ? (
					<DndContext
						collisionDetection={closestCenter}
						onDragEnd={handleDragEnd}
						sensors={sensors}
					>
						<SortableContext
							items={tabs.map((t) => t.id)}
							strategy={horizontalListSortingStrategy}
						>
							{tabNodes}
						</SortableContext>
					</DndContext>
				) : (
					tabNodes
				)}
			</div>
			{onNew ? (
				<button
					aria-label="New tab"
					className="grid size-7 shrink-0 cursor-pointer place-items-center rounded-md text-base-content/60 hover:bg-base-200 hover:text-base-content focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
					onClick={onNew}
					type="button"
				>
					<Plus aria-hidden className="size-3.5" />
				</button>
			) : null}
		</div>
	);
}

type TabItemProps = {
	tab: AppTab;
	activeId?: string;
	dndEnabled: boolean;
	onSelect?: (id: string) => void;
	onClose?: (id: string) => void;
};

/**
 * One tab row. When `dndEnabled`, calls `useSortable` to wire up the
 * drag transform + listeners. dnd-kit owns the element's `transform`
 * style; motion only touches `opacity` (dragged tabs dim to 0.5) so
 * the two libraries never write to the same CSS property.
 */
function TabItem({
	tab,
	activeId,
	dndEnabled,
	onSelect,
	onClose,
}: TabItemProps) {
	const sortable = useSortable({ id: tab.id, disabled: !dndEnabled });
	const active = tab.id === activeId;

	const dndStyle: CSSProperties = dndEnabled
		? {
				transform: CSS.Translate.toString(sortable.transform),
				transition: sortable.isDragging ? undefined : sortable.transition,
			}
		: {};

	return (
		<motion.div
			animate={{ opacity: sortable.isDragging ? 0.5 : 1 }}
			className={cn(
				"group/tab relative flex h-8 shrink-0 items-center rounded-t-md",
				// No `transition-colors` — snap the active highlight.
				active
					? "bg-base-100 text-base-content"
					: "text-base-content/60 hover:bg-base-200/60 hover:text-base-content",
			)}
			exit={{ opacity: 0 }}
			initial={{ opacity: 0 }}
			ref={dndEnabled ? sortable.setNodeRef : undefined}
			style={dndStyle}
			transition={{ duration: 0.15, ease: "easeOut" }}
			{...(dndEnabled ? sortable.attributes : {})}
			{...(dndEnabled ? sortable.listeners : {})}
		>
			{/*
			 * The tab itself (icon + title + dirty dot) is the role="tab"
			 * element — that is the click target that switches the active
			 * id. The close button below it is a sibling <button> so we
			 * never nest <button> in <button>, while the wrapping div
			 * carries the visual background and the drag listeners.
			 */}
			<button
				aria-selected={active}
				className={cn(
					"flex h-full max-w-44 cursor-pointer items-center gap-1.5 text-sm",
					onClose ? "pr-1 pl-2.5" : "px-2.5",
				)}
				onClick={() => onSelect?.(tab.id)}
				role="tab"
				tabIndex={active ? 0 : -1}
				type="button"
			>
				{tab.icon ? (
					<span aria-hidden className="shrink-0">
						{tab.icon}
					</span>
				) : null}
				<span className="min-w-0 truncate">{tab.title}</span>
				{tab.dirty ? (
					<span
						aria-label="Unsaved changes"
						className="size-1.5 shrink-0 rounded-full bg-primary"
						role="img"
					/>
				) : null}
			</button>
			{onClose ? (
				<button
					aria-label={`Close ${tab.title}`}
					className={cn(
						"mr-1.5 grid size-4 shrink-0 cursor-pointer place-items-center rounded text-base-content/50 hover:bg-base-300 hover:text-base-content",
						active ? "opacity-100" : "opacity-0 group-hover/tab:opacity-100",
					)}
					onClick={(event) => {
						event.stopPropagation();
						onClose(tab.id);
					}}
					// Block dnd-kit's pointer sensor from seeing this gesture so
					// clicking the X never starts a drag.
					onPointerDown={(event) => event.stopPropagation()}
					type="button"
				>
					<X aria-hidden className="size-3" />
				</button>
			) : null}
			{/*
			 * Active indicator. `layoutId` lets motion slide this underline
			 * between tabs when activeId changes. dnd-kit's transform moves
			 * the parent div (and therefore the underline) during a drag —
			 * the layoutId only triggers when the active id itself changes,
			 * so the two systems do not fight.
			 */}
			{active ? (
				<motion.span
					aria-hidden
					className="absolute inset-x-1 bottom-0 h-0.5 rounded-full bg-primary"
					layoutId="app-tabs-active"
					transition={{ duration: 0.18, ease: "easeOut" }}
				/>
			) : null}
		</motion.div>
	);
}
