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
			<div className="flex h-full w-full items-center justify-center text-sm text-base-content/60">
				{loadingContent ?? "Loading…"}
			</div>
		);
	}

	if (isBlocked) {
		return (
			<div className="flex h-full w-full items-center justify-center p-6 text-center text-sm text-error">
				{blockedContent ?? "Access to this space is blocked or unavailable."}
			</div>
		);
	}

	return <>{children}</>;
}
