import { AnimatePresence, motion } from "motion/react";
import type { ReactNode } from "react";
import { Bell } from "react-feather";
import { PolymorphButton } from "../actions/polymorph-button";
import { OverlayPortal } from "./overlay-portal";

export type NotificationItem = {
	id: string;
	title: string;
	body?: string;
	icon?: ReactNode;
	time?: string;
};

export type NotificationDrawerProps = {
	open: boolean;
	items: NotificationItem[];
	onClose?: () => void;
	title?: string;
};

export function NotificationDrawer({ open, items, onClose, title = "Notifications" }: NotificationDrawerProps) {
	return (
		<OverlayPortal>
			<AnimatePresence>
				{open ? (
					<>
						<div className="fixed inset-0 z-30 bg-base-content/30 backdrop-blur" onClick={onClose} />
						<motion.aside
							initial={{ x: 360, opacity: 0 }}
							animate={{ x: 0, opacity: 1 }}
							exit={{ x: 360, opacity: 0 }}
							transition={{ type: "spring", stiffness: 260, damping: 26 }}
							className="fixed right-0 top-0 z-40 h-full w-full max-w-sm bg-base-100 shadow-2xl"
						>
							<div className="flex items-center justify-between border-b border-base-300/70 px-4 py-3">
								<div className="flex items-center gap-2 text-sm font-semibold">
									<Bell size={16} />
									{title}
								</div>
								<PolymorphButton size="xs" variant="ghost" onClick={onClose}>
									Close
								</PolymorphButton>
							</div>
							<div className="flex h-full flex-col gap-2 overflow-auto px-3 py-3">
								{items.length === 0 ? (
									<div className="mt-6 text-center text-sm text-base-content/60">No notifications</div>
								) : (
									items.map((item) => (
										<div
											key={item.id}
											className="space-y-1 rounded-xl border border-base-300/60 bg-base-100/80 p-3 shadow-sm"
										>
											<div className="flex items-center gap-2">
												<div className="grid h-8 w-8 place-items-center rounded-lg bg-base-200 text-base-content/70">
													{item.icon ?? <Bell size={14} />}
												</div>
												<div className="flex-1">
													<div className="text-sm font-semibold">{item.title}</div>
													{item.time ? (
														<div className="text-[11px] uppercase text-base-content/50">{item.time}</div>
													) : null}
												</div>
											</div>
											{item.body ? <p className="text-xs text-base-content/70">{item.body}</p> : null}
										</div>
									))
								)}
							</div>
						</motion.aside>
					</>
				) : null}
			</AnimatePresence>
		</OverlayPortal>
	);
}
