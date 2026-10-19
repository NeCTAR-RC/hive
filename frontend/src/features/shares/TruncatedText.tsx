// A table cell's long text cut to one line with an ellipsis, and the full
// text in a design-system Tooltip on hover or keyboard focus. The DS has no
// focusable plain-text trigger, so react-aria's Focusable wraps the span
// (role="img" with the full text as its name, so assistive technology
// reads it whole). A candidate for src/components once another panel
// needs it.
import { Focusable } from "react-aria-components";
import { Tooltip, TooltipTrigger } from "@ardc-ui/react";
import styles from "./Shares.module.scss";

/** Text longer than this gets the tooltip; shorter text fits the cell. */
const LIMIT = 40;

export function TruncatedText({ text }: { text: string | null | undefined }) {
  const value = text ?? "";
  if (value.length <= LIMIT) return <>{value}</>;
  return (
    <TooltipTrigger>
      <Focusable>
        <span
          className={styles.truncated}
          // Keyboard users reach the tooltip through this stop; the DS has
          // no text trigger (see above).
          // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
          tabIndex={0}
          role="img"
          aria-label={value}
        >
          {value}
        </span>
      </Focusable>
      <Tooltip>{value}</Tooltip>
    </TooltipTrigger>
  );
}
