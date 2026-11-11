import { lazyChart } from "./lazyChart";

/** DailyLineChart behind a code split, with a skeleton while it loads. */
export const LazyDailyLineChart = lazyChart(() => import("./DailyLineChart"));
