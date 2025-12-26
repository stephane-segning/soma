import { create } from "zustand";

type UiState = {
	isCommandPaletteOpen: boolean;
	toggleCommandPalette: (open?: boolean) => void;
};

const useUiStore = create<UiState>((set) => ({
	isCommandPaletteOpen: false,
	toggleCommandPalette: (open) =>
		set((state) => ({
			isCommandPaletteOpen: open ?? !state.isCommandPaletteOpen,
		})),
}));

export { useUiStore };
