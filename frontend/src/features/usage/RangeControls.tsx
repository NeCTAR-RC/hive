// The Usage Trend page's date range picker and preset buttons.
import { parseDate } from "@internationalized/date";
import {
  DateRangePicker,
  Label,
  ToggleButtonGroup,
  ToggleButtonGroupItem,
} from "@ardc-ui/react";
import styles from "./UsageTrendPage.module.scss";
import { activePreset, daysAgo, PRESETS } from "./transform";

/**
 * The range the page shows: a date range picker bounded by the first day
 * with data and today, and presets that set a range ending today. The
 * preset the range is shows pressed (`aria-pressed`, the library toggle
 * button's selected state); dates that match no preset leave none pressed.
 * The group is a toolbar of toggle buttons rather than a radio group, so
 * "none pressed" reads naturally and each preset stays a button.
 */
export function RangeControls({
  begin,
  end,
  dataFrom,
  today,
  onChange,
}: {
  /** The range shown, as ISO dates. */
  begin: string;
  end: string;
  /** The first day with usage data, and today, as ISO dates. */
  dataFrom: string;
  today: string;
  onChange: (range: { begin: string; end: string }) => void;
}) {
  const active = activePreset({ begin, end }, dataFrom, today);
  return (
    <div className={styles.controls}>
      <div className={styles.range}>
        <DateRangePicker
          value={{ start: parseDate(begin), end: parseDate(end) }}
          onChange={(value) => {
            if (value) {
              onChange({
                begin: value.start.toString(),
                end: value.end.toString(),
              });
            }
          }}
          minValue={parseDate(dataFrom)}
          maxValue={parseDate(today)}
        >
          <Label>Date range</Label>
        </DateRangePicker>
      </div>
      <ToggleButtonGroup
        aria-label="Date range presets"
        selectionMode="multiple"
        selectedKeys={active ? [active] : []}
        onSelectionChange={(keys) => {
          // Pressing the pressed preset again changes nothing.
          const preset = PRESETS.find(
            (item) => item.id !== active && keys.has(item.id),
          );
          if (preset) {
            onChange({ begin: daysAgo(preset.days, today), end: today });
          }
        }}
      >
        {PRESETS.map((preset) => (
          <ToggleButtonGroupItem key={preset.id} id={preset.id}>
            {preset.label}
          </ToggleButtonGroupItem>
        ))}
      </ToggleButtonGroup>
    </div>
  );
}
