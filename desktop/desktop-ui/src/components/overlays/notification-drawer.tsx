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

export function NotificationDrawer({
	open,
	items,
	onClose,
	title = "Notifications",
}: NotificationDrawerProps) {
	return (
		<OverlayPortal>
			<AnimatePresence>
				{open ? (
					<>
						<motion.div
							animate={{ opacity: 1 }}
							className="fixed inset-0 z-30 bg-base-content/30 backdrop-blur"
							exit={{ opacity: 0 }}
							initial={{ opacity: 0 }}
							onClick={onClose}
							transition={{ duration: 0.2 }}
						/>
						<motion.aside
							animate={{ x: 0, opacity: 1 }}
							className="fixed top-0 right-0 z-40 h-full w-full max-w-sm bg-base-100 shadow-2xl"
							exit={{ x: 360, opacity: 0 }}
							initial={{ x: 360, opacity: 0 }}
							transition={{ type: "spring", stiffness: 260, damping: 26 }}
						>
							<div className="flex items-center justify-between border-base-300/70 border-b px-4 py-3">
								<div className="flex items-center gap-2 font-semibold text-sm">
									<Bell size={16} />
									{title}
								</div>
								<PolymorphButton onClick={onClose} size="xs" variant="ghost">
									Close
								</PolymorphButton>
							</div>
							<div className="flex h-full flex-col gap-2 overflow-auto px-3 py-3">
								{items.length === 0 ? (
									<div className="mt-6 text-center text-base-content/60 text-sm">
										No notifications
									</div>
								) : (
									items.map((item) => (
										<div
											className="space-y-1 rounded-xl border border-base-300/60 bg-base-100/80 p-3 shadow-sm"
											key={item.id}
										>
											<div className="flex items-center gap-2">
												<div className="grid h-8 w-8 place-items-center rounded-lg bg-base-200 text-base-content/70">
													{item.icon ?? <Bell size={14} />}
												</div>
												<div className="flex-1">
													<div className="font-semibold text-sm">
														{item.title}
													</div>
													{item.time ? (
														<div className="text-[11px] text-base-content/50 uppercase">
															{item.time}
														</div>
													) : null}
												</div>
											</div>
											{item.body ? (
												<p className="text-base-content/70 text-xs">
													{item.body}
												</p>
											) : null}
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
