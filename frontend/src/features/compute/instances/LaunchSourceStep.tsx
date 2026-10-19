// The launch wizard's source step: the boot-source type and the image,
// snapshot or volume to boot from. Changing the type clears the chosen
// source (useSourceTypeReset in launchForm.ts, applied by the wizard).
import { useId, useMemo, useState } from "react";
import { RadioGroup, RadioGroupItem, SearchField } from "@ardc-ui/react";
import { useController, useWatch } from "react-hook-form";
import { RadioInput, SwitchInput } from "../../../components/Form/fields";
import type {
  Image,
  LaunchOptions,
  LaunchSourceType,
} from "../../../lib/api/types";
import { formatBytes, formatGb, formatMb } from "../../../lib/format";
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
  const type = useWatch({ control: form.control, name: "source_type" });
  const zone = useWatch({ control: form.control, name: "availability_zone" });
  const { field, fieldState } = useController({
    control: form.control,
    name: "source_id",
  });
  const needle = query.trim().toLowerCase();

  const items = useMemo(() => {
    const matches = (name: string | null | undefined) =>
      !needle || (name ?? "").toLowerCase().includes(needle);
    if (type === "image" || type === "snapshot") {
      const list = (type === "image" ? data.images : data.snapshots) ?? [];
      return list
        .filter((image) => (needle ? true : !image.hidden_until_search))
        .filter((image) => matches(image.name))
        .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""))
        .map((image) => ({
          id: image.id,
          name: image.name ?? image.id,
          meta: imageMeta(image),
        }));
    }
    if (type === "volume") {
      return (data.volumes ?? [])
        .filter(
          (volume) =>
            !zone ||
            !volume.availability_zone ||
            volume.availability_zone === zone,
        )
        .filter((volume) => matches(volume.name))
        .map((volume) => ({
          id: volume.id,
          name: volume.name,
          meta: `${formatGb(volume.size_gb)}${volume.availability_zone ? `, ${volume.availability_zone}` : ""}`,
        }));
    }
    return (data.volume_snapshots ?? [])
      .filter((snapshot) => matches(snapshot.name))
      .map((snapshot) => ({
        id: snapshot.id,
        name: snapshot.name,
        meta: formatGb(snapshot.size_gb),
      }));
  }, [type, needle, zone, data]);

  const listed = items.slice(0, MAX_LISTED);
  const hiddenCommunity =
    type === "image" &&
    !needle &&
    (data.images ?? []).some((i) => i.hidden_until_search);
  const error = fieldState.error?.message;

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
      <div ref={(el) => field.ref(focusTarget(el))}>
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
      {(type === "volume" || type === "volume_snapshot") && (
        <SwitchInput
          control={form.control}
          name="delete_volume_on_termination"
          label="Delete the volume when the instance is deleted"
        />
      )}
    </div>
  );
}

function imageMeta(image: Image): string {
  const parts = [
    image.is_snapshot ? "snapshot" : image.visibility,
    formatBytes(image.size),
    image.min_disk ? `min disk ${image.min_disk} GB` : "",
    image.min_ram ? `min RAM ${formatMb(image.min_ram)}` : "",
  ];
  return parts.filter(Boolean).join(", ");
}
