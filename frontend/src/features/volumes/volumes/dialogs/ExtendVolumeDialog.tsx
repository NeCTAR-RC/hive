// The extend volume dialog: a larger size within the remaining quota.
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { fieldsFor } from "../../../../components/Form/fields";
import { FormDialog } from "../../../../components/FormDialog/FormDialog";
import { useMutationForm } from "../../../../components/FormDialog/useMutationForm";
import type { Volume } from "../../../../lib/api/types/volumes";
import { formatGb } from "../../../../lib/format";
import { useProjectId } from "../../../../lib/hooks/useProjectId";
import { useExtendVolume, volumeLimitsQuery } from "../../api";
import { gigabytesAvailable } from "../rules";
import { extendVolumeSchema } from "./schema";

/**
 * Grows a volume. The dialog states the current size and the quota left,
 * and the new size must be larger and fit that quota.
 */
export function ExtendVolumeDialog({
  volume,
  onClose,
}: {
  volume: Volume;
  onClose: () => void;
}) {
  const projectId = useProjectId();
  const limits = useQuery(volumeLimitsQuery(projectId));
  const current = volume.size_gb ?? 0;
  const available = gigabytesAvailable(limits.data);
  const schema = useMemo(
    () => extendVolumeSchema(current, available),
    [current, available],
  );
  const { NumberInput } = fieldsFor<z.infer<typeof schema>>();
  const { dialog } = useMutationForm({
    schema,
    defaultValues: { new_size: current + 1 },
    mutation: useExtendVolume(),
    toVariables: (values) => ({
      volumeId: volume.id,
      newSize: values.new_size,
    }),
    successMessage: (_result, values) =>
      `Extending volume ${volume.name || volume.id} to ${values.new_size} GB.`,
    onDone: onClose,
  });
  return (
    <FormDialog
      {...dialog}
      title={`Extend volume ${volume.name || volume.id}`}
      submitLabel="Extend volume"
    >
      <p>
        Current size: <strong>{formatGb(current)}</strong>.
        {available !== null && (
          <>
            {" "}
            You can add up to <strong>{formatGb(available)}</strong> within your
            quota.
          </>
        )}
      </p>
      <NumberInput
        name="new_size"
        label="New size"
        addon="GB"
        minValue={current + 1}
        isRequired
        description="A volume can grow but not shrink."
      />
    </FormDialog>
  );
}
