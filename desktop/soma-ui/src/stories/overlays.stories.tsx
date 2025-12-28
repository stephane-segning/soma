import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { AlertTriangle, Copy, MoreVertical, Trash2 } from "react-feather";
import { PolymorphButton } from "../components/actions/polymorph-button";
import { ContextMenu } from "../components/overlays/context-menu";
import { Modal } from "../components/overlays/modal";
import { DesktopToaster, notify } from "../components/overlays/toast";
import type { OverlayPosition } from "../types";

const meta: Meta = {
	title: "Desktop/Overlays",
	parameters: { layout: "padded" },
};

export default meta;
type Story = StoryObj;

export const OverlayShowcase: Story = {
	render: function OverlayStory() {
		const [modalOpen, setModalOpen] = useState(false);
		const [menuState, setMenuState] = useState<{
			open: boolean;
			position: OverlayPosition;
		}>({
			open: false,
			position: { x: 0, y: 0 },
		});

		return (
			<div
				className="relative min-h-[360px] rounded-2xl bg-base-200 p-6"
				onContextMenu={(event) => {
					event.preventDefault();
					setMenuState({
						open: true,
						position: { x: event.clientX, y: event.clientY },
					});
				}}
			>
				<div className="space-y-3">
					<h3 className="font-semibold text-lg">Overlays</h3>
					<p className="text-base-content/70 text-sm">
						Modal + context menu + Daisy-themed toasts. Right-click anywhere in
						this panel.
					</p>
					<div className="flex gap-3">
						<PolymorphButton
							onClick={() => setModalOpen(true)}
							variant="primary"
						>
							Open modal
						</PolymorphButton>
						<PolymorphButton
							onClick={() => notify.success("Saved to clipboard!")}
							variant="secondary"
						>
							Trigger toast
						</PolymorphButton>
					</div>
				</div>

				<DesktopToaster position="top-right" />

				<ContextMenu
					items={[
						{
							id: "copy",
							label: "Copy",
							icon: <Copy size={14} />,
							shortcut: "⌘C",
						},
						{ id: "more", label: "More", icon: <MoreVertical size={14} /> },
						{
							id: "danger",
							label: "Danger zone",
							icon: <AlertTriangle size={14} />,
							tone: "danger",
							onSelect: () => notify.error("Careful!"),
						},
						{
							id: "delete",
							label: "Delete",
							icon: <Trash2 size={14} />,
							tone: "danger",
						},
					]}
					onClose={() => setMenuState((state) => ({ ...state, open: false }))}
					open={menuState.open}
					position={menuState.position}
				/>

				<Modal
					actions={
						<div className="flex gap-2">
							<PolymorphButton
								onClick={() => setModalOpen(false)}
								variant="ghost"
							>
								Close
							</PolymorphButton>
							<PolymorphButton
								onClick={() => {
									notify.success("Changes saved");
									setModalOpen(false);
								}}
								variant="primary"
							>
								Save
							</PolymorphButton>
						</div>
					}
					description="This modal uses Motion for entrance/exit and DaisyUI for styling."
					onClose={() => setModalOpen(false)}
					open={modalOpen}
					title="Desktop overlay"
				>
					<div className="space-y-2">
						<p className="text-base-content/70 text-sm">
							Use this as a base for global overlays across Soma + Tapia.
							Content is left-aligned and uses glassmorphism.
						</p>
						<p className="text-base-content/50 text-xs">
							Animations rely on the Motion library; adjust MotionConfig in
							Storybook preview to tweak defaults.
						</p>
					</div>
				</Modal>
			</div>
		);
	},
};
