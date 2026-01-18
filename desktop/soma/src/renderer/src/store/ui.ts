import {
	createSlice,
	type PayloadAction,
} from "@reduxjs/toolkit";

type UiState =
	{
		isCommandPaletteOpen: boolean;
	};

const initialState: UiState =
	{
		isCommandPaletteOpen: false,
	};

const uiSlice =
	createSlice(
		{
			name: "ui",
			initialState,
			reducers:
				{
					toggleCommandPalette(
						state,
						action: PayloadAction<
							| boolean
							| undefined
						>,
					) {
						state.isCommandPaletteOpen =
							action.payload ??
							!state.isCommandPaletteOpen;
					},
				},
		},
	);

const uiReducer =
	uiSlice.reducer;
const uiActions =
	uiSlice.actions;
const uiSelectors =
	{
		selectIsCommandPaletteOpen:
			(state: {
				ui: UiState;
			}) =>
				state
					.ui
					.isCommandPaletteOpen,
	};

export {
	uiActions,
	uiReducer,
	uiSelectors,
};
export type {
	UiState,
};
