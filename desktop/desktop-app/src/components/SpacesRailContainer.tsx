/**
 * SpacesRailContainer — left-column wrapper around `@soma/ui`'s
 * `SpacesRail`. Pulls the real space list from the SDK and re-fetches
 * on `domain_event` broadcasts so the rail stays current when a peer
 * mints, deletes, or renames a space in the background.
 *
 * The previous Phase-1 version rendered a hard-coded mock list; this
 * version is the production wiring.
 */
import { type SpaceRailItem, SpacesRail } from "@soma/ui/components/nav/spaces-rail";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { backend } from "../lib/backend";

/** Two-letter monogram for the rail icon. Mirrors what SpacesRail expects. */
function monogram(displayName: string): string {
	const cleaned = displayName.trim();
	if (!cleaned) return "··";
	const words = cleaned.split(/\s+/);
	if (words.length === 1) {
		// "Personal" → "PE"; "🌱garden" → "🌱g"
		return Array.from(cleaned).slice(0, 2).join("").toUpperCase();
	}
	// "My Team Space" → "MT"
	return `${words[0][0] ?? ""}${words[1][0] ?? ""}`.toUpperCase();
}

export function SpacesRailContainer() {
	const navigate = useNavigate();
	const { spaceId } = useParams<{ spaceId?: string }>();
	const [items, setItems] = useState<SpaceRailItem[] | null>(null);

	useEffect(() => {
		let cancelled = false;

		async function load() {
			try {
				const result = await backend.spaces.list();
				if (cancelled) return;
				setItems(
					result.spaces.map((s) => ({
						id: s.spaceId,
						icon: monogram(s.displayName),
						name: s.displayName,
					})),
				);
			} catch (err) {
				console.error("[spaces-rail] list failed", err);
				if (!cancelled) setItems([]);
			}
		}

		void load();

		// Keep the rail fresh when other peers / windows mutate the space
		// inventory. We subscribe broadly to `domain_event` because the
		// SDK doesn't expose a typed `space-changed` channel today; the
		// refetch is cheap so this is fine.
		const unsubscribe = backend.events.onDomain(() => {
			void load();
		});

		return () => {
			cancelled = true;
			unsubscribe();
		};
	}, []);

	const safeItems = useMemo(() => items ?? [], [items]);

	return (
		<SpacesRail
			activeId={spaceId ?? null}
			items={safeItems}
			onCreate={() => {
				// TODO(palette): hook this into the `menu:new-space` command
				// once the AppLayout exposes a create-space affordance.
				console.info("[spaces-rail] create-space requested");
			}}
			onSelect={(id) => navigate(`/spaces/${id}`)}
		/>
	);
}
