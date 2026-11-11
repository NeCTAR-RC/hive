/**
 * The security risks page as its own chunk. The route in `routes.tsx` loads this
 * module on the first visit, so its code stays out of the first paint.
 * A group keeps this module even for one page, so every group splits the
 * same way.
 */
export { SecurityRisksPage } from "./SecurityRisksPage";
