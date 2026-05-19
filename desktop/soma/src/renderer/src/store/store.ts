import { configureStore } from "@reduxjs/toolkit";
import { setupListeners } from "@reduxjs/toolkit/query";
import { api } from "./api";
import { documentsReducer } from "./documents";
import { recentPagesReducer } from "./recent-pages";
import { tabsReducer } from "./tabs";
import { uiReducer } from "./ui";

const store = configureStore({
	reducer: {
		[api.reducerPath]: api.reducer,
		tabs: tabsReducer,
		ui: uiReducer,
		documents: documentsReducer,
		recentPages: recentPagesReducer,
	},
	middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(api.middleware),
});

type RootState = ReturnType<typeof store.getState>;
type AppDispatch = typeof store.dispatch;

setupListeners(store.dispatch);

export { store };
export type { AppDispatch, RootState };
