/**
 * DensityProvider — locked in
 * [ADR-0005 §7](../../../../../docs/src/architecture/adrs/0005-ui-revamp-v0.md)
 * and the density refs at
 * [prd/ui-revamp-v0-refs-files-density.md §3](../../../../../docs/src/architecture/prd/ui-revamp-v0-refs-files-density.md).
 *
 * v0 ships `dense` only. The provider exists so components can opt into
 * density-aware rendering today and the cozy/oversized variants become a
 * config flip post-v0, not a rewrite. Read density via {@link useDensity}.
 */
import { createContext, type ReactNode, useContext } from "react";

export type Density = "dense" | "cozy" | "oversized";

const DensityContext = createContext<Density>("dense");

export function DensityProvider({
	density = "dense",
	children,
}: {
	density?: Density;
	children: ReactNode;
}) {
	return (
		<DensityContext.Provider value={density}>
			{children}
		</DensityContext.Provider>
	);
}

export function useDensity(): Density {
	return useContext(DensityContext);
}

/**
 * Convenience helper that picks a value per density tier. Useful for
 * row-height utility selection or per-tier padding.
 *
 * ```ts
 * const rowClass = useDensityValue({
 *   dense: "row-text",
 *   cozy: "row-avatar",
 *   oversized: "row-card",
 * });
 * ```
 *
 * Property access is cheap; we deliberately do not wrap it in `useMemo`
 * (which would just add overhead and miss when `values` is an inline
 * object literal anyway).
 */
export function useDensityValue<T>(values: Record<Density, T>): T {
	const density = useDensity();
	return values[density];
}
