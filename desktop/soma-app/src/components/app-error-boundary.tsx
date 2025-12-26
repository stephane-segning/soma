import type { ErrorInfo } from "react";
import { ErrorBoundary, type FallbackProps } from "react-error-boundary";

function ErrorFallback({ error, resetErrorBoundary }: FallbackProps) {
	return (
		<div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
			<div className="space-y-1">
				<h2 className="font-semibold text-lg">Something went wrong</h2>
				<p className="text-base-content/70 text-sm">
					The renderer hit an unexpected error. Try reloading.
				</p>
			</div>
			<pre className="max-h-64 max-w-3xl overflow-auto rounded-lg border border-base-300 bg-base-200/70 px-4 py-3 text-left text-xs">
				{error?.stack}
			</pre>
			<pre className="max-h-64 max-w-3xl overflow-auto rounded-lg border border-base-300 bg-base-200/70 px-4 py-3 text-left text-xs">
				{error?.message || String(error)}
			</pre>
			<pre className="max-h-64 max-w-3xl overflow-auto rounded-lg border border-base-300 bg-base-200/70 px-4 py-3 text-left text-xs">
				{String(error)}
			</pre>
			<pre className="max-h-64 max-w-3xl overflow-auto rounded-lg border border-base-300 bg-base-200/70 px-4 py-3 text-left text-xs">
				{JSON.stringify(error, null, 4)}
			</pre>
			<div className="flex items-center gap-2">
				<button
					className="btn btn-primary btn-sm"
					onClick={() => {
						resetErrorBoundary();
						globalThis.location.reload();
					}}
					type="button"
				>
					Reload app
				</button>
			</div>
		</div>
	);
}

const logError = (error: Error, info: ErrorInfo) => {
	console.error(error, info);
};

function AppErrorBoundary({ children }: { children: React.ReactNode }) {
	return (
		<ErrorBoundary
			FallbackComponent={ErrorFallback}
			onError={logError}
			onReset={() => {}}
		>
			{children}
		</ErrorBoundary>
	);
}

export { AppErrorBoundary };
