// JSX types for the ARDC website's web components (see loader.ts).
import type { DetailedHTMLProps, HTMLAttributes } from "react";

type ArdcElementProps = DetailedHTMLProps<
  HTMLAttributes<HTMLElement>,
  HTMLElement
> & {
  "data-host"?: string;
  "data-content-width"?: "wide";
  "data-show-ardc-logo"?: string;
};

declare module "react" {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      "ardc-megamenu": ArdcElementProps;
      "ardc-footer": ArdcElementProps;
    }
  }
}
