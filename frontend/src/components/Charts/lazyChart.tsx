import { lazy, Suspense, type ComponentType } from "react";
import { Skeleton } from "../Skeleton/Skeleton";

/**
 * A chart behind a code split, with a skeleton filling its box while the
 * chart code (and Recharts with it) loads. Keeps Recharts out of the first
 * page load; `scripts/check-bundle.mjs` enforces that.
 */
export function lazyChart<P extends object>(
  load: () => Promise<{ default: ComponentType<P> }>,
): ComponentType<P> {
  const Chart = lazy(load);
  function LazyChart(props: P) {
    return (
      <Suspense fallback={<Skeleton height="100%" />}>
        <Chart {...props} />
      </Suspense>
    );
  }
  return LazyChart;
}
