import type { FallbackProps } from "react-error-boundary";

export function PageEditorFallback({ error, resetErrorBoundary }: FallbackProps): React.JSX.Element {
	const detail = error instanceof Error ? error.message : String(error);
	return (
		<div className="mx-auto my-8 w-full max-w-4xl rounded-2xl border border-error/30 bg-base-100 p-6 shadow-lg">
			<h2 className="font-semibold text-lg">Editor crashed</h2>
			<p className="mt-2 text-base-content/70 text-sm">{detail}</p>
			<div className="mt-4 flex items-center gap-2">
				<button className="btn btn-error btn-sm" onClick={resetErrorBoundary} type="button">
					Retry editor
				</button>
				<button className="btn btn-ghost btn-sm" onClick={() => globalThis.location.reload()} type="button">
					Reload page
				</button>
			</div>
		</div>
	);
}
