import {
	closestCenter,
	DndContext,
	type DragEndEvent,
	PointerSensor,
	useSensor,
	useSensors,
} from "@dnd-kit/core";
import {
	arrayMove,
	rectSortingStrategy,
	SortableContext,
	useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { Folder } from "react-feather";
import type { DesktopIcon, OverlayPosition } from "../../types";
import { cn } from "../../utils/cn";
import type { ContextMenuItem } from "../overlays/context-menu";
import { ContextMenu } from "../overlays/context-menu";

export type DesktopAreaProps = {
	items: DesktopIcon[];
	onActivate?: (item: DesktopIcon) => void;
	onReorder?: (items: DesktopIcon[]) => void;
	onContextMenu?: (item: DesktopIcon | null, position: OverlayPosition) => void;
	contextMenuItems?: (item: DesktopIcon | null) => ContextMenuItem[];
	className?: string;
	emptyHint?: string;
};

type MenuState = {
	open: boolean;
	itemId: string | null;
	position: OverlayPosition;
};

export function DesktopArea({
	items,
	onActivate,
	onReorder,
	onContextMenu,
	contextMenuItems,
	className,
	emptyHint = "Right-click to create or drag icons around.",
}: DesktopAreaProps) {
	const [orderedItems, setOrderedItems] = useState(items);
	const [menuState, setMenuState] = useState<MenuState>({
		open: false,
		itemId: null,
		position: { x: 0, y: 0 },
	});

	useEffect(() => {
		setOrderedItems(items);
	}, [items]);

	const sensors = useSensors(
		useSensor(PointerSensor, {
			activationConstraint: { distance: 8 },
		}),
	);

	const handleDragEnd = (event: DragEndEvent) => {
		const { active, over } = event;
		if (!over || active.id === over.id) return;

		setOrderedItems((prev) => {
			const oldIndex = prev.findIndex((item) => item.id === active.id);
			const newIndex = prev.findIndex((item) => item.id === over.id);
			const next = arrayMove(prev, oldIndex, newIndex);
			onReorder?.(next);
			return next;
		});
	};

	const iconsById = useMemo(
		() => Object.fromEntries(orderedItems.map((item) => [item.id, item])),
		[orderedItems],
	);

	const currentMenuItem = menuState.itemId
		? (iconsById[menuState.itemId] ?? null)
		: null;
	const menuItems =
		contextMenuItems?.(currentMenuItem ?? null) ??
		(currentMenuItem
			? [
					{
						id: "open",
						label: "Open",
						onSelect: () => currentMenuItem && onActivate?.(currentMenuItem),
					},
					{
						id: "rename",
						label: "Rename",
						shortcut: "F2",
					},
					{
						id: "info",
						label: "View details",
						shortcut: "⌘I",
					},
				]
			: [
					{
						id: "new-shortcut",
						label: "New shortcut",
						shortcut: "⌘N",
					},
					{
						id: "refresh",
						label: "Refresh layout",
						shortcut: "⌘R",
					},
					{
						id: "wallpaper",
						label: "Change wallpaper",
					},
				]);

	const openMenu = (itemId: string | null, event: React.MouseEvent) => {
		event.preventDefault();
		const position = { x: event.clientX, y: event.clientY };
		setMenuState({ open: true, itemId, position });
		onContextMenu?.(itemId ? (iconsById[itemId] ?? null) : null, position);
	};

	return (
		<div
			className={cn(
				"relative grid min-h-[420px] gap-4 rounded-2xl bg-base-100/30 p-6 backdrop-blur",
				className,
			)}
			onContextMenu={(event) => openMenu(null, event)}
		>
			<DndContext
				sensors={sensors}
				collisionDetection={closestCenter}
				onDragEnd={handleDragEnd}
			>
				<SortableContext
					items={orderedItems.map((item) => item.id)}
					strategy={rectSortingStrategy}
				>
					<div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
						{orderedItems.map((item) => (
							<DesktopIconTile
								key={item.id}
								item={item}
								onActivate={() => onActivate?.(item)}
								onContextMenu={(event) => openMenu(item.id, event)}
							/>
						))}
						<AnimatePresence>
							{orderedItems.length === 0 ? (
								<motion.div
									initial={{ opacity: 0 }}
									animate={{ opacity: 1 }}
									exit={{ opacity: 0 }}
									className="col-span-full flex items-center justify-center rounded-xl border border-dashed border-base-300/70 bg-base-100/50 px-4 py-12"
								>
									<p className="text-sm text-base-content/60">{emptyHint}</p>
								</motion.div>
							) : null}
						</AnimatePresence>
					</div>
				</SortableContext>
			</DndContext>

			<ContextMenu
				open={menuState.open}
				position={menuState.position}
				items={menuItems}
				onClose={() => setMenuState((state) => ({ ...state, open: false }))}
			/>
		</div>
	);
}

function DesktopIconTile({
	item,
	onActivate,
	onContextMenu,
}: {
	item: DesktopIcon;
	onActivate?: () => void;
	onContextMenu?: (event: React.MouseEvent) => void;
}) {
	const sortable = useSortable({ id: item.id });
	const style = {
		transform: CSS.Transform.toString(sortable.transform),
		transition: sortable.transition,
	};

	return (
		<motion.button
			layout
			type="button"
			ref={sortable.setNodeRef}
			style={style}
			{...sortable.attributes}
			{...sortable.listeners}
			onContextMenu={onContextMenu}
			className={cn(
				"group flex h-28 w-full flex-col items-center justify-center gap-3 rounded-2xl bg-base-100/60 px-3 py-3 text-center shadow-inner transition hover:-translate-y-0.5 hover:bg-base-200/80 hover:shadow-lg",
				"focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-base-200",
			)}
			onDoubleClick={onActivate}
		>
			<div className="grid h-14 w-14 place-items-center rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 text-primary">
				{item.icon ?? <Folder size={20} />}
			</div>
			<div className="text-sm font-medium text-base-content/90">
				{item.label}
			</div>
			{item.hint ? (
				<div className="text-xs text-base-content/60">{item.hint}</div>
			) : null}
		</motion.button>
	);
}
