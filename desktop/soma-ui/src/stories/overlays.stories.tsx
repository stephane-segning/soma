import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { AlertTriangle, Copy, MoreVertical, Trash2 } from "react-feather";
import { ContextMenu } from "../components/overlays/context-menu";
import { DesktopToaster, notify } from "../components/overlays/toast";
import { Modal } from "../components/overlays/modal";
import type { OverlayPosition } from "../types";
import { PolymorphButton } from "../components/actions/polymorph-button";

const meta: Meta = {
	title: "Desktop/Overlays",
	parameters: { layout: "padded" },
};

export default meta;
type Story = StoryObj;

export const OverlayShowcase: Story = {
	render: function OverlayStory() {
		const [modalOpen, setModalOpen] = useState(false);
		const [menuState, setMenuState] = useState<{ open: boolean; position: OverlayPosition }>({
			open: false,
			position: { x: 0, y: 0 },
		});

		return (
			<div
				className="relative min-h-[360px] rounded-2xl bg-base-200 p-6"
				onContextMenu={(event) => {
					event.preventDefault();
					setMenuState({ open: true, position: { x: event.clientX, y: event.clientY } });
				}}
			>
				<div className="space-y-3">
					<h3 className="text-lg font-semibold">Overlays</h3>
					<p className="text-sm text-base-content/70">
						Modal + context menu + Daisy-themed toasts. Right-click anywhere in this panel.
					</p>
					<div className="flex gap-3">
						<PolymorphButton variant="primary" onClick={() => setModalOpen(true)}>
							Open modal
						</PolymorphButton>
						<PolymorphButton variant="secondary" onClick={() => notify.success("Saved to clipboard!")}>
							Trigger toast
						</PolymorphButton>
					</div>
				</div>

				<DesktopToaster position="top-right" />

				<ContextMenu
					open={menuState.open}
					position={menuState.position}
					onClose={() => setMenuState((state) => ({ ...state, open: false }))}
					items={[
						{ id: "copy", label: "Copy", icon: <Copy size={14} />, shortcut: "⌘C" },
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
				/>

				<Modal
					open={modalOpen}
					title="Desktop overlay"
					description="This modal uses Motion for entrance/exit and DaisyUI for styling."
					onClose={() => setModalOpen(false)}
					actions={
						<div className="flex gap-2">
							<PolymorphButton variant="ghost" onClick={() => setModalOpen(false)}>
								Close
							</PolymorphButton>
							<PolymorphButton
								variant="primary"
								onClick={() => {
									notify.success("Changes saved");
									setModalOpen(false);
								}}
							>
								Save
							</PolymorphButton>
						</div>
					}
				>
					<div className="space-y-2">
						<p className="text-sm text-base-content/70">
							Use this as a base for global overlays across Soma + Tapia. Content is left-aligned and uses glassmorphism.
						</p>
						<p className="text-xs text-base-content/50">
							Animations rely on the Motion library; adjust MotionConfig in Storybook preview to tweak defaults.
						</p>
					</div>
				</Modal>
			</div>
		);
	},
};
