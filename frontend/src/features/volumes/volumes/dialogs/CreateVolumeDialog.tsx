// The create volume dialog: an empty volume or one copied from an image,
// a snapshot or another volume, sized within the source and the quota.
import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useWatch } from "react-hook-form";
import { Card } from "@ardc-ui/react";
import { fieldsFor } from "../../../../components/Form/fields";
import { FormDialog } from "../../../../components/FormDialog/FormDialog";
import { useMutationForm } from "../../../../components/FormDialog/useMutationForm";
import { OptionErrors } from "../../../../components/OptionErrors/OptionErrors";
import { QuotaMeter } from "../../../../components/QuotaMeter/QuotaMeter";
import type { VolumeSourceType } from "../../../../lib/api/types/volumes";
import { formatGb } from "../../../../lib/format";
import { useProjectId } from "../../../../lib/hooks/useProjectId";
import { quotaPair } from "../../../../lib/quota";
import { useCreateVolume, volumeOptionsQuery } from "../../api";
import {
  VOLUME_SOURCES,
  inheritsPlacement,
  sizeFloor,
  sourceChoices,
  typeLabel,
  typesForZone,
} from "../rules";
import styles from "../VolumeDialogs.module.scss";
import { volumeCreateRequest } from "./request";
import { createVolumeSchema, type CreateVolumeValues } from "./schema";

/**
 * Creates a volume. A link can name the source to start from; the size
 * follows the source's floor up, and a snapshot or volume source hides the
 * zone and type it fixes.
 */
export function CreateVolumeDialog({
  onClose,
  initialSource,
}: {
  onClose: () => void;
  initialSource?: { type: VolumeSourceType; id: string } | undefined;
}) {
  const projectId = useProjectId();
  const options = useQuery(volumeOptionsQuery(projectId));
  const schema = useMemo(
    () => createVolumeSchema(options.data),
    [options.data],
  );
  const { NumberInput, RadioInput, SelectInput, TextAreaInput, TextInput } =
    fieldsFor<CreateVolumeValues>();
  const { form, dialog } = useMutationForm({
    schema,
    defaultValues: {
      name: "",
      description: "",
      source: initialSource?.type ?? "none",
      source_id: initialSource?.id ?? "",
      size: 1,
      availability_zone: "",
      volume_type: "",
    },
    mutation: useCreateVolume(),
    toVariables: volumeCreateRequest,
    successMessage: (created) =>
      `Creating volume ${created.name || created.id}.`,
    onDone: onClose,
  });
  const source = useWatch({ control: form.control, name: "source" });
  const sourceId = useWatch({ control: form.control, name: "source_id" });
  const zone = useWatch({ control: form.control, name: "availability_zone" });
  const size = useWatch({ control: form.control, name: "size" });
  const inherits = inheritsPlacement(source);
  const floor = sizeFloor(options.data, source, sourceId);
  const limits = options.data?.limits;
  const storage = quotaPair(
    limits,
    "maxTotalVolumeGigabytes",
    "totalGigabytesUsed",
  );
  const volumes = quotaPair(limits, "maxTotalVolumes", "totalVolumesUsed");

  // A source sets the minimum size; follow it up, never down.
  useEffect(() => {
    if (floor > 1 && size < floor) form.setValue("size", floor);
  }, [floor, size, form]);

  // Reset the source picker when the source kind changes, except on the
  // first render where the page handed us a source to start from.
  useEffect(() => {
    if (source !== (initialSource?.type ?? "none")) {
      form.setValue("source_id", "");
    } else if (initialSource) {
      form.setValue("source_id", initialSource.id);
    }
  }, [source, initialSource, form]);

  const types = useMemo(
    () => typesForZone(options.data, zone),
    [options.data, zone],
  );
  const sourceOptions = useMemo(
    () => sourceChoices(options.data, source),
    [options.data, source],
  );

  return (
    <FormDialog
      {...dialog}
      error={dialog.error ?? options.error}
      title="Create volume"
      submitLabel="Create volume"
      size="lg"
    >
      <OptionErrors errors={options.data?.errors} />
      <TextInput name="name" label="Volume name" />
      <TextAreaInput name="description" label="Description" />
      <RadioInput
        name="source"
        label="Volume source"
        options={VOLUME_SOURCES}
      />
      {source !== "none" && (
        <SelectInput
          name="source_id"
          label={
            source === "image"
              ? "Image"
              : source === "snapshot"
                ? "Snapshot"
                : "Volume"
          }
          options={sourceOptions}
          isRequired
          isDisabled={options.isPending}
          placeholder={
            options.isPending
              ? "Loading..."
              : sourceOptions.length === 0
                ? "None available"
                : `Choose ${source === "image" ? "an image" : `a ${source}`}`
          }
          description={
            inherits
              ? "The new volume is created in the source's availability zone with the source's volume type."
              : undefined
          }
        />
      )}
      <NumberInput
        name="size"
        label="Size"
        addon="GB"
        minValue={floor}
        isRequired
        description={
          floor > 1
            ? `At least ${floor} GB for this source.`
            : "Whole gigabytes."
        }
      />
      {options.data && (
        <Card tone="grey">
          <div className={styles.quota}>
            <QuotaMeter
              label="Volume storage"
              value={storage.used}
              max={storage.max}
              format={formatGb}
            />
            <QuotaMeter
              label="Volumes"
              value={volumes.used}
              max={volumes.max}
            />
          </div>
        </Card>
      )}
      {!inherits && (
        <>
          <SelectInput
            name="availability_zone"
            label="Availability zone"
            options={(options.data?.availability_zones ?? [])
              .filter((z) => z.available)
              .map((z) => ({ id: z.name, label: z.name }))}
            isRequired
            isDisabled={options.isPending}
            placeholder={
              options.isPending ? "Loading..." : "Choose an availability zone"
            }
            description="Volumes can only be attached to instances in the same zone."
          />
          {zone && (
            <SelectInput
              name="volume_type"
              label="Volume type"
              options={[
                { id: "", label: "Default volume type" },
                ...types.map((t) => ({ id: t.name, label: typeLabel(t) })),
              ]}
              description={
                options.data?.has_zoned_types
                  ? `Showing the types available in ${zone}.`
                  : undefined
              }
            />
          )}
        </>
      )}
    </FormDialog>
  );
}
