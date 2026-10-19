// The launch wizard's source step: the boot-source type, the image,
// snapshot or volume to boot from, and, for an image or snapshot, Horizon's
// "Create New Volume" fields. Changing the type clears the chosen source
// and the new-volume fields (useSourceTypeReset in launchForm.ts, applied
// by the wizard).
import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  Button,
  RadioGroup,
  RadioGroupItem,
  SearchField,
} from "@ardc-ui/react";
import { useController, useWatch } from "react-hook-form";
import {
  NumberInput,
  RadioInput,
  SelectInput,
  SwitchInput,
} from "../../../components/Form/fields";
import type { LaunchOptions, LaunchSourceType } from "../../../lib/api/types";
import { formatGb } from "../../../lib/format";
import { typesForZone } from "../../volumes/volumes/rules";
import {
  findImage,
  findSourceItem,
  GIB,
  imageMeta,
  launchZone,
  volumeMeta,
  type SourceItem,
} from "./launch";
import { focusTarget, type LaunchFormApi } from "./launchForm";
import styles from "./LaunchPage.module.scss";

const SOURCE_TYPES: { id: LaunchSourceType; label: string }[] = [
  { id: "image", label: "Image" },
  { id: "snapshot", label: "Instance snapshot" },
  { id: "volume", label: "Volume" },
  { id: "volume_snapshot", label: "Volume snapshot" },
];

const MAX_LISTED = 200;

export function SourceStep({
  form,
  data,
}: {
  form: LaunchFormApi;
  data: LaunchOptions;
}) {
  const [query, setQuery] = useState("");
  const errorId = useId();
  const listRef = useRef<HTMLDivElement | null>(null);
  const [type, chosenZone, flavorId, createVolume, floor] = useWatch({
    control: form.control,
    name: [
      "source_type",
      "availability_zone",
      "flavor_id",
      "create_volume",
      "volume_size_min_gb",
    ],
  });
  const zone = launchZone(data.flavors, flavorId, chosenZone);
  const reserved = Boolean(chosenZone) && !zone;
  const { field, fieldState } = useController({
    control: form.control,
    name: "source_id",
  });
  const needle = query.trim().toLowerCase();
  const selected = findSourceItem(data, type, field.value);

  const items = useMemo(() => {
    const matches = (name: string | null | undefined) =>
      !needle || (name ?? "").toLowerCase().includes(needle);
    // The chosen item is always listed, whatever the search says and even
    // when it is a community image that only a search would show.
    const chosen = (id: string) => id === field.value;
    let list: SourceItem[];
    if (type === "image" || type === "snapshot") {
      const images = (type === "image" ? data.images : data.snapshots) ?? [];
      list = images
        .filter(
          (image) =>
            chosen(image.id) ||
            ((needle ? true : !image.hidden_until_search) &&
              matches(image.name)),
        )
        .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""))
        .map((image) => ({
          id: image.id,
          name: image.name ?? image.id,
          meta: imageMeta(image),
        }));
    } else if (type === "volume") {
      list = (data.volumes ?? [])
        .filter(
          (volume) =>
            chosen(volume.id) ||
            ((!zone ||
              !volume.availability_zone ||
              volume.availability_zone === zone) &&
              matches(volume.name)),
        )
        .map((volume) => ({
          id: volume.id,
          name: volume.name,
          meta: volumeMeta(volume),
        }));
    } else {
      list = (data.volume_snapshots ?? [])
        .filter((snapshot) => chosen(snapshot.id) || matches(snapshot.name))
        .map((snapshot) => ({
          id: snapshot.id,
          name: snapshot.name,
          meta: formatGb(snapshot.size_gb),
        }));
    }
    return list;
  }, [type, needle, zone, data, field.value]);

  // Coming back to the step: the list box scrolls to the checked item so a
  // choice below its fold is in view (jsdom has no scrollIntoView).
  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>("input:checked")
      ?.scrollIntoView?.({ block: "nearest" });
  }, []);

  const listed = items.slice(0, MAX_LISTED);
  const hiddenCommunity =
    type === "image" &&
    !needle &&
    (data.images ?? []).some((i) => i.hidden_until_search);
  const error = fieldState.error?.message;
  const fromImage = type === "image" || type === "snapshot";

  // Why the size floor is what it is, for the field's description.
  const image = findImage(data, type, field.value);
  const flavor = data.flavors?.find((f) => f.id === flavorId);
  const reasons = [
    image
      ? `the image needs ${Math.max(
          Math.ceil((image.size ?? 0) / GIB),
          image.min_disk ?? 0,
          1,
        )} GB`
      : "",
    flavor?.disk_gb
      ? `the ${flavor.name} root disk is ${flavor.disk_gb} GB`
      : "",
  ].filter(Boolean);
  const types = typesForZone(data, zone);

  return (
    <div className={styles.fields}>
      <RadioInput
        control={form.control}
        name="source_type"
        label="Boot source"
        options={SOURCE_TYPES.map((option) => ({
          ...option,
          isDisabled:
            (option.id === "volume" && !data.volumes) ||
            (option.id === "volume_snapshot" && !data.volume_snapshots) ||
            (option.id === "snapshot" && !data.snapshots),
        }))}
      />
      <p className={styles.selectedRow}>
        {selected ? (
          <>
            <span>
              Selected: <strong>{selected.name}</strong>
            </span>
            {selected.meta && (
              <span className={styles.selectedMeta}>{selected.meta}</span>
            )}
            <Button
              variant="link"
              size="xs"
              onPress={() => {
                field.onChange("");
                form.clearErrors("source_id");
              }}
            >
              Clear
            </Button>
          </>
        ) : (
          <span className={styles.hint}>No source selected yet.</span>
        )}
      </p>
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
        className={styles.search}
      />
      {hiddenCommunity && (
        <p className={styles.hint}>
          Community images shared by other projects are shown once you search
          for them.
        </p>
      )}
      <div
        ref={(el) => {
          listRef.current = el;
          field.ref(focusTarget(el));
        }}
      >
        <RadioGroup
          aria-label="Source"
          value={field.value || null}
          onChange={(value) => {
            field.onChange(value);
            void form.trigger("source_id");
          }}
          isInvalid={Boolean(error)}
          {...(error ? { "aria-describedby": errorId } : {})}
          className={styles.sourceList}
        >
          {listed.length === 0 && (
            <p className={styles.hint}>Nothing matches.</p>
          )}
          {listed.map((item) => (
            <RadioGroupItem key={item.id} value={item.id}>
              <span className={styles.sourceName}>{item.name}</span>
              <span className={styles.sourceMeta}>{item.meta}</span>
            </RadioGroupItem>
          ))}
        </RadioGroup>
      </div>
      {items.length > MAX_LISTED && (
        <p className={styles.hint}>
          Showing the first {MAX_LISTED} of {items.length}. Refine your search
          to see more.
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className={styles.error}>
          {error}
        </p>
      )}
      {fromImage && (
        <>
          {/* Horizon hides the toggle until a zone is chosen (Nectar patch
              216995ea1); it is disabled here instead, since the steps can
              be visited in any order. */}
          <SwitchInput
            control={form.control}
            name="create_volume"
            label="Create a new volume from the image"
            isDisabled={!zone}
          />
          {!zone && (
            <p className={styles.hint}>
              {reserved
                ? "Not available with a reservation flavour: the reservation decides the availability zone."
                : "Choose an availability zone on the Details step first; the volume is created in that zone."}
            </p>
          )}
          {createVolume && (
            <>
              <NumberInput
                control={form.control}
                name="volume_size_gb"
                label="Volume size (GB)"
                description={`At least ${floor} GB${
                  reasons.length ? ` (${reasons.join("; ")})` : ""
                }.`}
                minValue={floor}
                step={1}
                isRequired
              />
              <SelectInput
                control={form.control}
                name="volume_type"
                label="Volume type"
                options={[
                  { id: "", label: "Default volume type" },
                  ...types.map((t) => ({
                    id: t.name,
                    label: t.description
                      ? `${t.name} (${t.description})`
                      : t.name,
                  })),
                ]}
                description={
                  data.has_zoned_types
                    ? `Showing the types available in ${zone}.`
                    : undefined
                }
              />
            </>
          )}
        </>
      )}
      {(type === "volume" || type === "volume_snapshot" || createVolume) && (
        <SwitchInput
          control={form.control}
          name="delete_volume_on_termination"
          label="Delete the volume when the instance is deleted"
        />
      )}
    </div>
  );
}
