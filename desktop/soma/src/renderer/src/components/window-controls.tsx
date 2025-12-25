import { useWindowControls } from "../hooks/use-window-controls";

function WindowControls(): React.JSX.Element | null {
	const controls = useWindowControls();

	return (
		<div className="flex items-center gap-2 [-webkit-app-region:no-drag]">
			<button
				aria-label="Close window"
				className="size-3 rounded-full bg-error hover:bg-red-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-error/60"
				onClick={() => controls.close()}
				type="button"
			/>
			<button
				aria-label="Minimize window"
				className="size-3 rounded-full bg-warning hover:bg-yellow-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-warning/60"
				onClick={() => controls.minimize()}
				type="button"
			/>
			<button
				aria-label="Maximize window"
				className="size-3 rounded-full bg-success hover:bg-green-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-success/60"
				onClick={() => controls.toggleMaximize()}
				type="button"
			/>
		</div>
	);
}

export { WindowControls };
