// One flavour's row of the availability chart.
import { useId } from "react";
import {
  Button as AriaButton,
  Disclosure,
  DisclosurePanel,
} from "react-aria-components";
import { Minus, Plus } from "@ardc-ui/react";
import { KeyValueList } from "../../components/KeyValueList/KeyValueList";
import { formatCalendarDate } from "../../lib/format";
import { FreeSlot } from "./FreeSlot";
import {
  plural,
  type GanttRange,
  type GanttRow,
  type PickedSlot,
} from "./gantt";
import { MaintenanceWindow } from "./MaintenanceWindow";
import styles from "./SlotGantt.module.scss";
import { flavorDisk, flavorRate, flavorSize } from "./status";

/**
 * One flavour: its name in the sticky label column, which discloses the
 * flavour's details, and its track of slots and maintenance windows. A
 * flavour with no free slot says so on its track.
 */
export function FlavorRow({
  row,
  range,
  searchedTo,
  track,
  isAlternate,
  eligible,
  canReserve,
  onPick,
}: {
  row: GanttRow;
  range: GanttRange;
  /** The last day the slot search covered. */
  searchedTo: string;
  track: string;
  isAlternate: boolean;
  eligible: number;
  canReserve: boolean;
  onPick: (picked: PickedSlot) => void;
}) {
  const labelId = useId();
  const { flavor } = row;
  const hasFree = row.bars.some((bar) => bar.kind === "free");
  return (
    <div role="group" aria-labelledby={labelId} className={styles.row}>
      <Disclosure className={styles.label}>
        {({ isExpanded }) => (
          <>
            <AriaButton slot="trigger" className={styles.toggle}>
              <span id={labelId}>{flavor.name ?? flavor.id}</span>
              <span className={styles.icon} aria-hidden="true">
                {isExpanded ? <Minus /> : <Plus />}
              </span>
            </AriaButton>
            <DisclosurePanel className={styles.details}>
              <KeyValueList
                items={[
                  { label: "Class", value: flavor.category },
                  { label: "Description", value: flavor.description },
                  {
                    label: "Availability zone",
                    value: flavor.availability_zone,
                  },
                  { label: "Size", value: flavorSize(flavor) },
                  { label: "Disk", value: flavorDisk(flavor) },
                  {
                    label: "Max duration",
                    value: plural(flavor.max_days, "day", "days"),
                  },
                  { label: "Usage rate", value: flavorRate(flavor) },
                ]}
              />
            </DisclosurePanel>
          </>
        )}
      </Disclosure>
      <div
        className={styles.track}
        data-alternate={isAlternate || undefined}
        style={{ gridTemplateColumns: track }}
      >
        {range.todayIndex >= 0 && (
          <span
            className={styles.todayColumn}
            style={{ gridColumn: range.todayIndex + 1 }}
            aria-hidden="true"
          />
        )}
        {!hasFree && (
          <span className={styles.noSlots}>
            No free time slots up to {formatCalendarDate(searchedTo)}.
          </span>
        )}
        {row.bars.map((bar) =>
          bar.kind === "maintenance" ? (
            <MaintenanceWindow key={bar.id} bar={bar} />
          ) : (
            <FreeSlot
              key={bar.id}
              row={row}
              bar={bar}
              eligible={eligible}
              isDisabled={!canReserve || eligible === 0}
              onPick={onPick}
            />
          ),
        )}
      </div>
    </div>
  );
}
