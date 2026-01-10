import { configureStore } from "@reduxjs/toolkit";
import { documentsReducer } from "./documents";
import { tabsReducer } from "./tabs";
import { uiReducer } from "./ui";

const store = configureStore({
	reducer: {
		tabs: tabsReducer,
		ui: uiReducer,
		documents: documentsReducer,
	},
});

type RootState = ReturnType<typeof store.getState>;
type AppDispatch = typeof store.dispatch;

export { store };
export type { AppDispatch, RootState };
