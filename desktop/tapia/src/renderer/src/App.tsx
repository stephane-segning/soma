import type { ChangeEvent } from "react";
import { Fragment, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
	Link,
	Outlet,
	useNavigate,
	useOutletContext,
	useParams,
} from "react-router";
import { DEFAULT_SPACE_ID } from "./routes/constants";

type Space = { id: string; name: string; accent: string; description: string };
type LayoutContext = {
	spaces: Space[];
	activeSpaceId: string;
	navigateToSpace: (spaceId: string) => void;
};

const spaceOptions: Space[] = [
	{
		id: "practice",
		name: "Practice Space",
		accent: "#7af5d1",
		description: "Offline drills",
	},
	{
		id: "focus",
		name: "Focus Lab",
		accent: "#f8d66d",
		description: "Agent-crafted prompts",
	},
];

function AppLayout(): React.JSX.Element {
	const { t } = useTranslation();
	const params = useParams();
	const navigate = useNavigate();

	const resolvedSpaceId = useMemo(() => {
		if (
			params.spaceId &&
			spaceOptions.some((space) => space.id === params.spaceId)
		) {
			return params.spaceId;
		}
		return DEFAULT_SPACE_ID;
	}, [params.spaceId]);

	useEffect(() => {
		if (!params.spaceId || params.spaceId !== resolvedSpaceId) {
			navigate(`/spaces/${resolvedSpaceId}/exercises`, { replace: true });
		}
	}, [navigate, params.spaceId, resolvedSpaceId]);

	const onSpaceChange = (event: ChangeEvent<HTMLSelectElement>): void => {
		navigate(`/spaces/${event.target.value}/exercises`);
	};

	return (
		<div className="app-shell">
			<header className="app-header">
				<div className="brand">
					<span className="brand-mark" />
					<div>
						<div className="brand-title">{t("appName")}</div>
						<p className="brand-subtitle">space-bound typing companion</p>
					</div>
				</div>
				<div className="space-switcher">
					<label htmlFor="space-select">{t("selectSpace")}</label>
					<div className="space-select">
						<span
							className="space-accent"
							style={{
								background: spaceOptions.find(
									(space) => space.id === resolvedSpaceId,
								)?.accent,
							}}
						/>
						<select
							id="space-select"
							onChange={onSpaceChange}
							value={resolvedSpaceId}
						>
							{spaceOptions.map((space) => (
								<option key={space.id} value={space.id}>
									{space.name}
								</option>
							))}
						</select>
					</div>
				</div>
				<nav className="header-nav">
					<Link to={`/spaces/${resolvedSpaceId}/exercises`}>
						{t("exercises")}
					</Link>
				</nav>
			</header>
			<main className="app-main">
				<Outlet
					context={
						{
							spaces: spaceOptions,
							activeSpaceId: resolvedSpaceId,
							navigateToSpace: (spaceId: string) =>
								navigate(`/spaces/${spaceId}/exercises`),
						} satisfies LayoutContext
					}
				/>
			</main>
			<footer className="app-footer">
				{spaceOptions.map((space) => (
					<Fragment key={space.id}>
						<span className="foot-space">{space.name}</span>
						<span className="foot-desc">{space.description}</span>
					</Fragment>
				))}
			</footer>
		</div>
	);
}

function useAppLayoutContext(): LayoutContext {
	return useOutletContext<LayoutContext>();
}

export { AppLayout, useAppLayoutContext };
