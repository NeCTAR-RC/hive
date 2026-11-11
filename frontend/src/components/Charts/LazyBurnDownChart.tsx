import { lazyChart } from "./lazyChart";

/** BurnDownChart behind a code split, with a skeleton while it loads. */
export const LazyBurnDownChart = lazyChart(() => import("./BurnDownChart"));
