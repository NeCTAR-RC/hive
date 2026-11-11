// The launch wizard's boot source step: the source type, the chosen
// source, a searchable radio list of the sources of that type, and the
// boot volume choices.
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Button,
  FieldError,
  RadioGroup,
  RadioGroupItem,
  SearchField,
} from "@ardc-ui/react";
import { useFormContext, useWatch } from "react-hook-form";
import { fieldsFor } from "../../../../components/Form/fields";
import type {
  LaunchOptions,
  LaunchSourceType,
} from "../../../../lib/api/types/compute";
import { typeLabel } from "../../../volumes/volumes/rules";
import {
  emptySourceText,
  findSourceItem,
  sourceItems,
  volumeSizeNote,
  volumeTypesForZone,
} from "../launch";
import { isReservationFlavor } from "../launchFlavors";
import {
  canCreateVolume,
  chosenImage,
  chosenVolumeFloor,
  DEFAULT_VOLUME_TYPE,
  effectiveZone,
  volumeSizeAtFloor,
  type LaunchForm,
} from "../launchForm";
import styles from "../LaunchPage.module.scss";
import { StepError } from "./StepError";

const { NumberInput, RadioInput, SelectInput, SwitchInput } =
  fieldsFor<LaunchForm>();

const SOURCE_TYPES: { id: LaunchSourceType; label: string }[] = [
  { id: "image", label: "Image" },
  { id: "snapshot", label: "Instance snapshot" },
  { id: "volume", label: "Volume" },
  { id: "volume_snapshot", label: "Volume snapshot" },
];

const MAX_LISTED = 200;

/**
 * The boot source: a type (those the options cannot list are disabled),
 * the chosen source named above the list with a way to clear it, then one
 * source of the type from a list capped at the first 200 matches. The
 * chosen source stays listed whatever the search shows, and the list
 * scrolls to it when the step is shown again. Community images appear once
 * the user searches; an empty list says why. An image or instance snapshot
 * can be copied to a new volume (Horizon's "Create New Volume") of a size
 * the image and the flavour's root disk set the floor of, and a type the
 * zone offers; it needs a zone. A volume the instance boots from can be
 * deleted with it. Changing the type clears the source and the new volume,
 * as Horizon's source step does (source.controller.js
 * updateBootSourceSelection).
 */
export function SourceStep({ data }: { data: LaunchOptions }) {
  const form = useFormContext<LaunchForm>();
  const [query, setQuery] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const [type, chosen, availabilityZone, flavorId, createVolume] = useWatch({
    control: form.control,
    name: [
      "source_type",
      "source_id",
      "availability_zone",
      "flavor_id",
      "create_volume",
    ],
  });
  const zone = effectiveZone(data, {
    availability_zone: availabilityZone,
    flavor_id: flavorId,
  });
  const reserved = isReservationFlavor(data.flavors, flavorId);
  const needle = query.trim();
  const volumeChoice = canCreateVolume(type);
  const choice = { source_type: type, source_id: chosen, flavor_id: flavorId };
  const floor = chosenVolumeFloor(data, choice);
  const flavor = data.flavors?.find((f) => f.id === flavorId);

  // A new volume starts at the smallest size the chosen source and flavour
  // fit in, and grows with a larger source.
  useEffect(() => {
    if (!createVolume) return;
    const raised = volumeSizeAtFloor(form.getValues("volume_size_gb"), floor);
    if (raised !== undefined) {
      form.setValue("volume_size_gb", raised, { shouldDirty: true });
    }
  }, [createVolume, floor, form]);

  // Shown again, the list scrolls to the checked source, so a choice below
  // the box's fold is in view.
  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>("input:checked")
      ?.scrollIntoView({ block: "nearest" });
  }, []);

  const items = useMemo(
    () => sourceItems(data, type, zone, needle, chosen),
    [data, type, zone, needle, chosen],
  );
  const selected = findSourceItem(data, type, chosen);
  const listed = items.slice(0, MAX_LISTED);
  const hiddenCommunity =
    type === "image" &&
    !needle &&
    (data.images ?? []).some((i) => i.hidden_until_search);
  const error = form.formState.errors.source_id?.message;
  const zoneError = form.formState.errors.create_volume?.message;
  const volumeTypes = volumeTypesForZone(data, zone);

  // A source belongs to its type, and only an image or snapshot is copied
  // to a new volume: switching type starts the source over.
  const resetSource = () => {
    form.setValue("source_id", "", { shouldDirty: true });
    form.setValue("create_volume", false, { shouldDirty: true });
    form.setValue("volume_size_gb", undefined, { shouldDirty: true });
    form.setValue("volume_type", DEFAULT_VOLUME_TYPE, { shouldDirty: true });
    form.setValue("delete_volume_on_termination", false, {
      shouldDirty: true,
    });
    form.clearErrors([
      "source_id",
      "create_volume",
      "volume_size_gb",
      "volume_type",
    ]);
  };
  const clearSource = () => {
    form.setValue("source_id", "", { shouldDirty: true });
    form.clearErrors("source_id");
  };

  return (
    <div className={styles.fields}>
      <RadioInput
        name="source_type"
        label="Boot source"
        onValueChange={resetSource}
        options={SOURCE_TYPES.map((option) => ({
          ...option,
          isDisabled:
            (option.id === "volume" && !data.volumes) ||
            (option.id === "volume_snapshot" && !data.volume_snapshots) ||
            (option.id === "snapshot" && !data.snapshots),
        }))}
      />
      <div className={styles.selectedRow}>
        {selected ? (
          <>
            <span>
              Selected: <strong>{selected.name}</strong>
            </span>
            <span className={styles.hint}>{selected.meta}</span>
            <Button variant="link" size="xs" onPress={clearSource}>
              Clear
            </Button>
          </>
        ) : (
          <span className={styles.hint}>No source selected yet.</span>
        )}
      </div>
      <SearchField
        size="sm"
        aria-label="Search sources"
        value={query}
        onChange={setQuery}
        placeholder={
          type === "image"
            ? "Search images (community images appear when you search)"
            : "Search"
        }
      />
      {hiddenCommunity && (
        <p className={styles.hint}>
          Community images shared by other projects are shown once you search
          for them.
        </p>
      )}
      <RadioGroup
        aria-label="Source"
        value={chosen}
        onChange={(value) =>
          form.setValue("source_id", value, {
            shouldValidate: true,
            shouldDirty: true,
          })
        }
        isInvalid={Boolean(error)}
      >
        <div ref={listRef} className={styles.sourceList}>
          {listed.length === 0 && (
            <p className={styles.hint}>{emptySourceText(type, zone, needle)}</p>
          )}
          {listed.map((item) => (
            <RadioGroupItem key={item.id} value={item.id}>
              <span className={styles.sourceName}>{item.name}</span>
              <span className={styles.sourceMeta}>{item.meta}</span>
            </RadioGroupItem>
          ))}
        </div>
        {error && (
          <div role="alert" className={styles.error}>
            <FieldError>{error}</FieldError>
          </div>
        )}
      </RadioGroup>
      {items.length > MAX_LISTED && (
        <p className={styles.hint}>
          Showing the first {MAX_LISTED} of {items.length}. Refine your search
          to see more.
        </p>
      )}
      {volumeChoice && (
        <div className={styles.volumeChoice}>
          <SwitchInput
            name="create_volume"
            label="Create a new volume"
            isDisabled={!zone && !createVolume}
          />
          <p className={styles.hint}>
            {zone
              ? "Copies the source to a new volume the instance boots from, so the root disk can be larger than the flavour's and can outlive the instance."
              : reserved
                ? "Not available with a reservation flavour: the reservation decides the availability zone."
                : "Choose an availability zone on the Details step to boot from a new volume."}
          </p>
          <StepError message={zoneError} />
        </div>
      )}
      {volumeChoice && createVolume && (
        <>
          <NumberInput
            name="volume_size_gb"
            label="Volume size"
            description={volumeSizeNote(chosenImage(data, choice), flavor)}
            addon="GB"
            minValue={floor}
            isRequired
          />
          <SelectInput
            name="volume_type"
            label="Volume type"
            description={
              data.has_zoned_types && zone
                ? `Showing the types available in ${zone}.`
                : undefined
            }
            options={[
              { id: DEFAULT_VOLUME_TYPE, label: "Default volume type" },
              ...volumeTypes.map((t) => ({ id: t.name, label: typeLabel(t) })),
            ]}
          />
        </>
      )}
      {(!volumeChoice || createVolume) && (
        <SwitchInput
          name="delete_volume_on_termination"
          label="Delete the volume when the instance is deleted"
        />
      )}
    </div>
  );
}
