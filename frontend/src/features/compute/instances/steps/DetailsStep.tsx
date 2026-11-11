// The launch wizard's first step: name, description, zone and count.
import { useFormContext, useWatch } from "react-hook-form";
import { fieldsFor } from "../../../../components/Form/fields";
import type { LaunchOptions } from "../../../../lib/api/types/compute";
import { volumeZoneNote } from "../launch";
import { isReservationFlavor } from "../launchFlavors";
import {
  ANY_ZONE,
  ANY_ZONE_LABEL,
  chosenZone,
  offeredVolumeType,
  type LaunchForm,
} from "../launchForm";
import styles from "../LaunchPage.module.scss";

const { NumberInput, SelectInput, TextInput } = fieldsFor<LaunchForm>();

/**
 * The instance's name and description, the availability zone it runs in
 * ("Any availability zone" first and the default, as Horizon's; unavailable
 * zones listed but disabled; a volume source names its own; a reservation
 * flavour sets it) and how many to launch, within the quota.
 */
export function DetailsStep({ data }: { data: LaunchOptions }) {
  const form = useFormContext<LaunchForm>();
  const [type, id, flavorId] = useWatch({
    control: form.control,
    name: ["source_type", "source_id", "flavor_id"],
  });
  const reserved = isReservationFlavor(data.flavors, flavorId);
  const volumeNote = volumeZoneNote(data, type, id);
  const zones = [
    { id: ANY_ZONE, label: ANY_ZONE_LABEL },
    ...(data.availability_zones ?? []).map((zone) => ({
      id: zone.name,
      label: zone.available ? zone.name : `${zone.name} (unavailable)`,
      isDisabled: !zone.available,
    })),
  ];
  // A new zone that does not offer the chosen volume type drops it.
  const keepOfferedType = (zone: string) => {
    const current = form.getValues("volume_type");
    const kept = offeredVolumeType(data, chosenZone(zone), current);
    if (kept !== current) form.setValue("volume_type", kept);
  };
  return (
    <div className={styles.fields}>
      <TextInput name="name" label="Instance name" isRequired />
      <TextInput name="description" label="Description" />
      <SelectInput
        name="availability_zone"
        label="Availability zone"
        description={
          reserved
            ? "Set by the reservation: a reservation flavour runs on its reserved hosts."
            : (volumeNote ??
              "Where the instance runs. Any availability zone lets the cloud pick one with room; volumes can only attach to instances in their own zone.")
        }
        options={zones}
        onValueChange={keepOfferedType}
        isDisabled={reserved}
        isRequired
      />
      <NumberInput
        name="count"
        label="Count"
        description="How many identical instances to launch."
        minValue={1}
        maxValue={100}
        isRequired
      />
    </div>
  );
}
