/**
 * The usage pages as one chunk. The routes in `routes.tsx` load this
 * module the first time one of them is visited, so the group's code stays
 * out of the first paint and arrives whole for the group's other pages.
 */
export { AllocationUsagePage } from "./AllocationUsagePage";
export { UsageTrendPage } from "./UsageTrendPage";
