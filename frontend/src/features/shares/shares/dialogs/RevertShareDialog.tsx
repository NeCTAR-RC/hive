// The revert share dialog (manila-ui shares/forms.py).
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Alert } from "@ardc-ui/react";
import { z } from "zod";
import { fieldsFor } from "../../../../components/Form/fields";
import { ErrorState } from "../../../../components/ErrorState/ErrorState";
import { FormDialog } from "../../../../components/FormDialog/FormDialog";
import { useMutationForm } from "../../../../components/FormDialog/useMutationForm";
import { SkeletonLines } from "../../../../components/Skeleton/Skeleton";
import type { Share } from "../../../../lib/api/types/shares";
import { useProjectId } from "../../../../lib/hooks/useProjectId";
import { shareSnapshotsQuery, useRevertShare } from "../../api";
import { newestSnapshot } from "../../status";

const revertSchema = z.object({
  snapshot_id: z.string().min(1, "Choose a snapshot"),
});

/**
 * Reverts a share to its newest snapshot, the only one manila reverts to;
 * the changes made since are lost. Without a snapshot there is nothing to
 * revert to, and the dialog says so.
 */
export function RevertShareDialog({
  share,
  onClose,
}: {
  share: Share;
  onClose: () => void;
}) {
  const projectId = useProjectId();
  const snapshots = useQuery(shareSnapshotsQuery(projectId));
  const newest = useMemo(
    () => newestSnapshot(snapshots.data?.items ?? [], share.id),
    [snapshots.data, share.id],
  );
  // The newest snapshot, the only one manila reverts to, is preselected.
  const preselected = useMemo(
    () => ({ snapshot_id: newest?.id ?? "" }),
    [newest],
  );
  const { SelectInput } = fieldsFor<z.infer<typeof revertSchema>>();
  const { dialog } = useMutationForm({
    schema: revertSchema,
    values: preselected,
    mutation: useRevertShare(),
    toVariables: (values) => ({
      id: share.id,
      snapshotId: values.snapshot_id,
    }),
    successMessage: `Share ${share.name || share.id} is being reverted.`,
    onDone: onClose,
  });
  return (
    <FormDialog
      {...dialog}
      title={`Revert ${share.name || share.id}`}
      submitLabel="Revert"
      submitTone="danger"
      isSubmitDisabled={!newest}
    >
      {snapshots.isPending ? (
        <SkeletonLines lines={2} />
      ) : snapshots.isError ? (
        <ErrorState
          error={snapshots.error}
          onRetry={() => void snapshots.refetch()}
        />
      ) : (
        <>
          <p>
            Only the newest snapshot can be reverted to. Changes since it are
            lost.
          </p>
          {!newest && (
            <Alert tone="warning" role="status">
              The share has no snapshot to revert to.
            </Alert>
          )}
          <SelectInput
            name="snapshot_id"
            label="Snapshot"
            options={
              newest ? [{ id: newest.id, label: newest.name || newest.id }] : []
            }
            isRequired
          />
        </>
      )}
    </FormDialog>
  );
}
