// The launch wizard's summary panel beside the steps.
import { useQuery } from "@tanstack/react-query";
import { useWatch } from "react-hook-form";
import type { UseFormReturn } from "react-hook-form";
import { KeyValueList } from "../../../components/KeyValueList/KeyValueList";
import { Panel } from "../../../components/Panel/Panel";
import type { LaunchOptions } from "../../../lib/api/types/compute";
import { formatSuRate } from "../../../lib/format";
import { useProjectId } from "../../../lib/hooks/useProjectId";
import { reservationsQuery } from "../../reservations/api";
import { chosenNetworks, findSourceItem } from "./launch";
import { flavorDisplayName } from "./launchFlavors";
import {
  ANY_ZONE_LABEL,
  chosenZone,
  newVolumeSummary,
  NONE,
  type LaunchForm,
} from "./launchForm";
import styles from "./LaunchPage.module.scss";

/**
 * What the launch will create so far: the names of the chosen source,
 * new volume, flavour (a reservation's by its reservation) and networks in
 * interface order, the zone (set by the reservation for a reservation
 * flavour), and the cost per hour for the whole count. With no key pair
 * chosen it says that SSH login will not work.
 */
export function LaunchSummary({
  form,
  data,
}: {
  form: UseFormReturn<LaunchForm>;
  data: LaunchOptions | undefined;
}) {
  const projectId = useProjectId();
  // Subscribes only the summary, not the wizard, to every keystroke.
  const values = useWatch({ control: form.control });
  const flavor = data?.flavors?.find((f) => f.id === values.flavor_id);
  const reservations = useQuery({
    ...reservationsQuery(projectId),
    enabled: Boolean(flavor?.is_reservation),
  });
  const source =
    data && values.source_type
      ? findSourceItem(data, values.source_type, values.source_id ?? "")
      : undefined;
  const networkNames = chosenNetworks(data?.networks, values.networks ?? [])
    .map((n) => n.name)
    .join(", ");
  const zone = flavor?.is_reservation
    ? "Set by the reservation"
    : chosenZone(values.availability_zone ?? "") || ANY_ZONE_LABEL;
  // The count field is empty while the user retypes it.
  const count = values.count || 1;
  const rate = flavor?.su_rate ?? null;
  const keyPair =
    values.key_name && values.key_name !== NONE ? values.key_name : "";
  return (
    <aside className={styles.summary} aria-label="Summary">
      <Panel title="Summary">
        <KeyValueList
          items={[
            { label: "Name", value: values.name },
            { label: "Count", value: values.count },
            { label: "Availability zone", value: zone },
            { label: "Source", value: source?.name ?? "" },
            { label: "Volume", value: newVolumeSummary(values) },
            {
              label: "Flavour",
              value: flavor
                ? flavorDisplayName(flavor, reservations.data?.items)
                : undefined,
            },
            {
              label: "Cost",
              value:
                rate === null
                  ? ""
                  : `${formatSuRate(rate * count)}${count > 1 ? ` (${formatSuRate(rate)} each)` : ""}`,
            },
            { label: "Networks", value: networkNames },
            {
              label: "Security groups",
              value: (values.security_groups ?? []).join(", "),
            },
            { label: "Key pair", value: keyPair || "None" },
          ]}
        />
        {!keyPair && (
          <p className={styles.hint}>
            Without a key pair you cannot log in to the instance with SSH.
          </p>
        )}
      </Panel>
    </aside>
  );
}
