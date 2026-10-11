import { lazy, Suspense } from "react";
import type { DailyLineChartProps } from "./DailyLineChart";
import { Skeleton } from "../Skeleton/Skeleton";

const DailyLineChart = lazy(() => import("./DailyLineChart"));

/** DailyLineChart behind a code split, with a skeleton while it loads. */
export function LazyDailyLineChart(props: DailyLineChartProps) {
  return (
    <Suspense fallback={<Skeleton height="100%" />}>
      <DailyLineChart {...props} />
    </Suspense>
  );
}
