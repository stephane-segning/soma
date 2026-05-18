import type { ReactNode } from "react";

type GuardProps = {
	isLoading?: boolean;
	loadingContent?: ReactNode;
	isBlocked?: boolean;
	blockedContent?: ReactNode;
	children: ReactNode;
};

export function DesktopGuardRail({
	isLoading,
	loadingContent,
	isBlocked,
	blockedContent,
	children,
}: GuardProps) {
	if (isLoading) {
		return (
			<div className="flex h-full w-full items-center justify-center text-base-content/60 text-sm">
				{loadingContent ?? "Loading…"}
			</div>
		);
	}

	if (isBlocked) {
		return (
			<div className="flex h-full w-full items-center justify-center p-6 text-center text-error text-sm">
				{blockedContent ?? "Access to this space is blocked or unavailable."}
			</div>
		);
	}

	return <>{children}</>;
}
