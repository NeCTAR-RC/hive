import type { ReactElement } from "react";
import { Loading } from "@ardc-ui/react";

export interface SkeletonProps {
  /** Ignored: it sized the grey placeholder bar this used to draw. */
  width?: string | number;
  /** Ignored: it sized the grey placeholder bar this used to draw. */
  height?: string | number;
  /** Ignored: the library `Loading` takes no class name from a consumer. */
  className?: string;
}

/**
 * Holds the place of content that is still loading: the library `Loading`,
 * as shipped (its 84px loader, without a message). The design system draws
 * no skeleton (the gap "Inline loading placeholder" in DESIGN-NOTES.md). It
 * is hidden from assistive technology; the surrounding region announces the
 * loading state.
 *
 * The props are accepted and ignored until the callers stop passing them.
 */
export const Skeleton: (props: SkeletonProps) => ReactElement = () => (
  <Loading aria-hidden="true" />
);

/**
 * Placeholder for several lines of text: the same library `Loading`. `lines`
 * is accepted and ignored until the callers stop passing it.
 */
export const SkeletonLines: (props: {
  lines?: number;
}) => ReactElement = () => <Loading aria-hidden="true" />;
