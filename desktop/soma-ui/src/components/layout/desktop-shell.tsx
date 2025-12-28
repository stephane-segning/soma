import type { ReactNode } from "react";

export type DesktopShellProps = {
	leftColumn?: ReactNode;
	rightColumn?: ReactNode;
	children?: ReactNode;
	wallpaper?: ReactNode;
	taskbar?: ReactNode;
	dock?: ReactNode;
	overlays?: ReactNode;
	className?: string;
};

export function DesktopShell({
	leftColumn,
	rightColumn,
	children,
	wallpaper,
	taskbar,
	dock,
	overlays,
	className,
}: DesktopShellProps) {
	return (
		<div
			className={`relative h-screen w-screen overflow-hidden bg-base-200 text-base-content ${className ?? ""}`}
		>
			<div className="absolute inset-0">
				<div className="absolute inset-0 bg-gradient-to-br from-base-200 via-base-300/60 to-base-100" />
				<div className="absolute inset-0 wallpaper-grid opacity-40" />
				{wallpaper}
			</div>

			<div className="relative z-10 flex h-full w-full flex-col">
				<div className="flex-1 overflow-auto">
					<div className="mx-auto flex w-full max-w-7xl items-start gap-x-8 px-4 py-10 sm:px-6 lg:px-8">
						{leftColumn ? (
							<aside className="sticky top-8 hidden w-48 shrink-0 space-y-3 lg:block">
								{leftColumn}
							</aside>
						) : null}
						<main className="flex-1 space-y-4">{children}</main>
						{rightColumn ? (
							<aside className="sticky top-8 hidden w-96 shrink-0 space-y-3 xl:block">
								{rightColumn}
							</aside>
						) : null}
					</div>
				</div>

				{taskbar ? <div className="relative z-20">{taskbar}</div> : null}
				{dock ? (
					<div className="pointer-events-none absolute inset-x-0 bottom-8 z-20 flex justify-center">
						<div className="pointer-events-auto">{dock}</div>
					</div>
				) : null}
			</div>

			{overlays ? (
				<div className="pointer-events-none absolute inset-0 z-30">
					{overlays}
				</div>
			) : null}
		</div>
	);
}
