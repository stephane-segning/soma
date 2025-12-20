import { Dialog, Transition } from "@headlessui/react";
import { AnimatePresence, motion } from "motion/react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "../lib/cn";

type ModalProps = {
	open: boolean;
	onClose: () => void;
	title?: ReactNode;
	children: ReactNode;
	className?: string;
};

function Modal({
	open,
	onClose,
	title,
	children,
	className,
}: ModalProps): React.JSX.Element {
	const { t } = useTranslation("common");

	return (
		<AnimatePresence>
			{open ? (
				<Dialog onClose={onClose} open={open} className="relative z-50">
					<Transition
						show={open}
						as={motion.div}
						className="fixed inset-0 bg-base-300/50 backdrop-blur"
						enter={{ opacity: 0 }}
						enterTo={{ opacity: 1 }}
						leave={{ opacity: 1 }}
						leaveTo={{ opacity: 0 }}
					/>
					<div className="fixed inset-0 flex items-center justify-center p-6">
						<Transition
							show={open}
							as={motion.div}
							initial={{ opacity: 0, scale: 0.96 }}
							animate={{ opacity: 1, scale: 1 }}
							exit={{ opacity: 0, scale: 0.96 }}
							className="w-full max-w-lg"
						>
							<Dialog.Panel
								className={cn(
									"card bg-base-100 shadow-xl border border-base-300",
									className,
								)}
							>
								<div className="card-body space-y-4">
									<Dialog.Title className="card-title text-lg font-semibold">
										{title ?? (
											<span className="skeleton h-5 w-32" aria-hidden />
										)}
									</Dialog.Title>
									<div className="prose prose-sm text-base-content/80">
										{children ?? (
											<div className="space-y-2">
												<div className="skeleton h-4 w-full" />
												<div className="skeleton h-4 w-5/6" />
											</div>
										)}
									</div>
									<div className="flex justify-end gap-2">
										<button
											type="button"
											className="btn btn-ghost"
											onClick={onClose}
											aria-label={t(
												"components.modal.closeLabel",
												"Close dialog",
											)}
										>
											{t("components.modal.closeLabel", "Close dialog")}
										</button>
									</div>
								</div>
							</Dialog.Panel>
						</Transition>
					</div>
				</Dialog>
			) : null}
		</AnimatePresence>
	);
}

export { Modal };
