import type { ErrorInfo } from "react";
import { ErrorBoundary, type FallbackProps } from "react-error-boundary";

function errorDetails(error: unknown): { message: string; stack?: string } {
	if (error instanceof Error) {
		return {
			message: error.message || "Unexpected renderer error.",
			stack: error.stack,
		};
	}

	return {
		message: String(error),
	};
}

function ErrorFallback({ error, resetErrorBoundary }: FallbackProps) {
	const details = errorDetails(error);

	return (
		<div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
			<div className="space-y-1">
				<h2 className="font-semibold text-lg">Something went wrong</h2>
				<p className="text-base-content/70 text-sm">The renderer hit an unexpected error. Try reloading.</p>
			</div>
			{details.stack ? (
				<pre className="max-h-64 max-w-3xl overflow-auto rounded-lg border border-base-300 bg-base-200/70 px-4 py-3 text-left text-xs">
					{details.stack}
				</pre>
			) : null}
			<pre className="max-h-64 max-w-3xl overflow-auto rounded-lg border border-base-300 bg-base-200/70 px-4 py-3 text-left text-xs">
				{details.message}
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

const logError = (error: unknown, info: ErrorInfo) => {
	console.error(error, info);
};

function AppErrorBoundary({ children }: { children: React.ReactNode }) {
	return (
		<ErrorBoundary FallbackComponent={ErrorFallback} onError={logError} onReset={() => {}}>
			{children}
		</ErrorBoundary>
	);
}

export { AppErrorBoundary };
