import { useEffect, useMemo, useState } from "react";
import { normalizePanelOpen, normalizePanelWidth } from "./constants";
import { readPersistedState, writePersistedState } from "./storage";

type DesktopShellStateInput = {
	defaultLeftOpen?: boolean;
	defaultRightOpen?: boolean;
	initialLeftWidth?: number;
	initialRightWidth?: number;
	storageKey?: string;
};

export function useDesktopShellState({
	defaultLeftOpen = true,
	defaultRightOpen = true,
	initialLeftWidth = 240,
	initialRightWidth = 260,
	storageKey,
}: DesktopShellStateInput) {
	const initialPersistedState = useMemo(() => readPersistedState(storageKey), [storageKey]);
	const [leftOpen, setLeftOpen] = useState(() =>
		normalizePanelOpen(initialPersistedState?.leftOpen, defaultLeftOpen),
	);
	const [rightOpen, setRightOpen] = useState(() =>
		normalizePanelOpen(initialPersistedState?.rightOpen, defaultRightOpen),
	);
	const [leftWidth, setLeftWidth] = useState(() =>
		normalizePanelWidth(initialPersistedState?.leftWidth, initialLeftWidth),
	);
	const [rightWidth, setRightWidth] = useState(() =>
		normalizePanelWidth(initialPersistedState?.rightWidth, initialRightWidth),
	);

	useEffect(() => {
		const persisted = readPersistedState(storageKey);
		setLeftOpen(normalizePanelOpen(persisted?.leftOpen, defaultLeftOpen));
		setRightOpen(normalizePanelOpen(persisted?.rightOpen, defaultRightOpen));
		setLeftWidth(normalizePanelWidth(persisted?.leftWidth, initialLeftWidth));
		setRightWidth(normalizePanelWidth(persisted?.rightWidth, initialRightWidth));
	}, [defaultLeftOpen, defaultRightOpen, initialLeftWidth, initialRightWidth, storageKey]);

	useEffect(() => {
		writePersistedState(storageKey, {
			leftOpen,
			rightOpen,
			leftWidth,
			rightWidth,
		});
	}, [leftOpen, leftWidth, rightOpen, rightWidth, storageKey]);

	return {
		leftOpen,
		rightOpen,
		leftWidth,
		rightWidth,
		setLeftWidth,
		setRightWidth,
		toggleLeft: () => setLeftOpen((open) => !open),
		toggleRight: () => setRightOpen((open) => !open),
	};
}
