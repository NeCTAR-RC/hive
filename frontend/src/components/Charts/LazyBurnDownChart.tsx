import { lazy, Suspense } from "react";
import type { BurnDownChartProps } from "./BurnDownChart";
import { Skeleton } from "../Skeleton/Skeleton";

const BurnDownChart = lazy(() => import("./BurnDownChart"));

/** BurnDownChart behind a code split, with a skeleton while it loads. */
export function LazyBurnDownChart(props: BurnDownChartProps) {
  return (
    <Suspense fallback={<Skeleton height="100%" />}>
      <BurnDownChart {...props} />
    </Suspense>
  );
}
