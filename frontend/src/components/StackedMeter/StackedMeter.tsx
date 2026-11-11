import { Meter, Text } from "@ardc-ui/react";
import { formatNumber } from "../../lib/format";

/**
 * What is already used against a limit, and what the current choice would
 * add (a reservation's days, its service units). The library `Meter`, as
 * shipped, fills to the used share; the pending share and the combined
 * total are said in its description ("7 of 20 days with 5 added"), with
 * "over the limit" once the two together pass it. The library meter has one
 * fill and no warning tone (the gap "Meter with threshold tones" in
 * DESIGN-NOTES.md), so the words carry what a second segment would.
 *
 * The meter has no visible label (the caller shows the figure above it), so
 * `label` is its accessible name. A limit of zero or less reads as a full
 * bar: nothing more fits.
 */
export function StackedMeter({
  label,
  used,
  pending,
  max,
  valueText,
}: {
  label: string;
  used: number;
  pending: number;
  max: number;
  valueText: string;
}) {
  const over = max <= 0 || used + pending > max;
  // Rounded as the callers round the combined figure they pass in.
  const added = Math.round(Math.max(pending, 0));
  const total =
    added > 0 ? `${valueText} with ${formatNumber(added)} added` : valueText;
  const description = over ? `${total}: over the limit` : total;
  const limited = max > 0;
  return (
    <Meter
      aria-label={label}
      minValue={0}
      maxValue={limited ? max : 1}
      value={limited ? Math.min(Math.max(used, 0), max) : 1}
    >
      <Text slot="description">{description}</Text>
    </Meter>
  );
}
