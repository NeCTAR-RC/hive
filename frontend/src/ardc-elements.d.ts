import type { DetailedHTMLProps, HTMLAttributes } from "react";

/**
 * The agency web components React renders (see `shell/ArdcFooter.tsx`).
 * `data-content-width` takes the component's column widths: "small" 1024px,
 * "normal" (the default) 1280px, "wide" 1440px, "full" the window.
 */
declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "ardc-footer": DetailedHTMLProps<
        HTMLAttributes<HTMLElement>,
        HTMLElement
      > & {
        "data-content-width"?: "small" | "normal" | "wide" | "full";
        "data-show-ardc-logo"?: "";
      };
    }
  }
}
