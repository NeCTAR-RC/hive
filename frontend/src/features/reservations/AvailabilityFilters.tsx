// The availability chart's flavour class and availability zone filters.
import { useId } from "react";
import {
  Label,
  Select,
  SelectItem,
  ToggleButtonGroup,
  ToggleButtonGroupItem,
} from "@ardc-ui/react";
import type { SearchPatch } from "../../lib/hooks/useSearchPatch";
import styles from "./CreateReservationPage.module.scss";

const ALL = "__all";

/**
 * The chart's toolbar: the flavour class as a toggle group and the zone as
 * a select, each with an "All" choice that clears its filter. The filters
 * live in the create page's URL search.
 */
export function AvailabilityFilters({
  category,
  zone,
  categories,
  zones,
  onFilter,
}: {
  /** The chosen class and zone, "" for all. */
  category: string;
  zone: string;
  categories: string[];
  zones: string[];
  onFilter: SearchPatch<"/app/reservations/new">;
}) {
  const classLabelId = useId();
  return (
    <div className={styles.toolbar}>
      <div className={styles.field}>
        <span id={classLabelId} className={styles.fieldLabel}>
          Flavour class
        </span>
        <ToggleButtonGroup
          selectionMode="single"
          disallowEmptySelection
          selectedKeys={new Set([category || ALL])}
          onSelectionChange={(keys) => {
            const [key] = keys;
            onFilter({
              category: key === undefined || key === ALL ? "" : String(key),
            });
          }}
          aria-labelledby={classLabelId}
        >
          <ToggleButtonGroupItem id={ALL}>All</ToggleButtonGroupItem>
          {categories.map((item) => (
            <ToggleButtonGroupItem key={item} id={item}>
              {item}
            </ToggleButtonGroupItem>
          ))}
        </ToggleButtonGroup>
      </div>
      <div className={styles.zone}>
        <Select
          selectedKey={zone || ALL}
          onSelectionChange={(key) =>
            onFilter({ zone: key === ALL ? "" : String(key) })
          }
        >
          <Label>Availability zone</Label>
          <SelectItem id={ALL}>All</SelectItem>
          {zones.map((item) => (
            <SelectItem key={item} id={item}>
              {item}
            </SelectItem>
          ))}
        </Select>
      </div>
    </div>
  );
}
