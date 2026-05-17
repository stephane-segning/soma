import type { ChangeEvent } from "react";
import { useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Link, Outlet, useLocation, useNavigate, useOutletContext, useParams } from "react-router";
import { DEFAULT_PRACTICE_SPACE_ID, PRACTICE_SPACE_OPTIONS, type PracticeSpace } from "./constants";

type LayoutContext = {
	spaces: readonly PracticeSpace[];
	activeSpaceId: string;
	navigateToSpace: (spaceId: string) => void;
};

function Component(): React.JSX.Element {
	const { t } = useTranslation("common");
	const params = useParams();
	const navigate = useNavigate();
	const location = useLocation();

	const resolvedSpaceId = useMemo(() => {
		if (params.spaceId && PRACTICE_SPACE_OPTIONS.some((space) => space.id === params.spaceId)) {
			return params.spaceId;
		}
		return DEFAULT_PRACTICE_SPACE_ID;
	}, [params.spaceId]);

	useEffect(() => {
		// When loaded at /practice (no spaceId), redirect to the default space.
		if (!params.spaceId && location.pathname.replace(/\/$/, "") === "/practice") {
			navigate(`/practice/spaces/${resolvedSpaceId}/exercises`, { replace: true });
		}
	}, [navigate, params.spaceId, resolvedSpaceId, location.pathname]);

	const onSpaceChange = (event: ChangeEvent<HTMLSelectElement>): void => {
		navigate(`/practice/spaces/${event.target.value}/exercises`);
	};

	const activeSpace = PRACTICE_SPACE_OPTIONS.find((space) => space.id === resolvedSpaceId);

	return (
		<div className="practice-shell">
			<header className="practice-header">
				<div className="practice-brand">
					<span className="practice-brand-mark" />
					<div>
						<div className="practice-brand-title">{t("practice.appName")}</div>
						<p className="practice-brand-subtitle">focused typing practice</p>
					</div>
				</div>
				<div className="practice-space-switcher">
					<label htmlFor="practice-space-select">{t("practice.selectSpace")}</label>
					<div className="practice-space-select">
						<span
							className="practice-space-accent"
							style={{
								background: activeSpace?.accent,
							}}
						/>
						<select id="practice-space-select" onChange={onSpaceChange} value={resolvedSpaceId}>
							{PRACTICE_SPACE_OPTIONS.map((space) => (
								<option key={space.id} value={space.id}>
									{space.name}
								</option>
							))}
						</select>
					</div>
				</div>
				<nav className="practice-header-nav">
					<Link to={`/practice/spaces/${resolvedSpaceId}/exercises`}>{t("practice.exercises")}</Link>
				</nav>
			</header>
			<main className="practice-main">
				<Outlet
					context={
						{
							spaces: PRACTICE_SPACE_OPTIONS,
							activeSpaceId: resolvedSpaceId,
							navigateToSpace: (spaceId: string) => navigate(`/practice/spaces/${spaceId}/exercises`),
						} satisfies LayoutContext
					}
				/>
			</main>
			<footer className="practice-footer">
				{PRACTICE_SPACE_OPTIONS.map((space) => (
					<div className="practice-footer-item" key={space.id}>
						<span className="practice-foot-space">{space.name}</span>
						<span className="practice-foot-desc">{space.description}</span>
					</div>
				))}
			</footer>
		</div>
	);
}

function usePracticeLayoutContext(): LayoutContext {
	return useOutletContext<LayoutContext>();
}

export { Component, usePracticeLayoutContext };
