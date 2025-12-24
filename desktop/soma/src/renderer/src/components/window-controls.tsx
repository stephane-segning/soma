type WindowApi = {
	minimize?: () => void;
	toggleMaximize?: () => void;
	close?: () => void;
};

function getWindowApi(): WindowApi | null {
	const anyWindow = window as unknown as { api?: { window?: WindowApi } };
	return anyWindow.api?.window ?? null;
}

function WindowControls(): React.JSX.Element | null {
	const api = getWindowApi();
	if (!api) return null;

	return (
		<div className="flex items-center gap-2 [-webkit-app-region:no-drag]">
			<button
				aria-label="Close window"
				className="size-3 rounded-full bg-error hover:bg-red-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-error/60"
				onClick={() => api.close?.()}
				type="button"
			/>
			<button
				aria-label="Minimize window"
				className="size-3 rounded-full bg-warning hover:bg-yellow-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-warning/60"
				onClick={() => api.minimize?.()}
				type="button"
			/>
			<button
				aria-label="Maximize window"
				className="size-3 rounded-full bg-success hover:bg-green-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-success/60"
				onClick={() => api.toggleMaximize?.()}
				type="button"
			/>
		</div>
	);
}

export { WindowControls };
