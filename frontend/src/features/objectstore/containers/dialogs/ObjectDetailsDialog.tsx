// An object's details: size, type, hash, segments and metadata.
import { useQuery } from "@tanstack/react-query";
import { Button, Dialog, Modal } from "@ardc-ui/react";
import { ErrorState } from "../../../../components/ErrorState/ErrorState";
import { KeyValueList } from "../../../../components/KeyValueList/KeyValueList";
import { SkeletonLines } from "../../../../components/Skeleton/Skeleton";
import type { StoreObject } from "../../../../lib/api/types/objectstore";
import { formatBytes, formatDateTime } from "../../../../lib/format";
import { useProjectId } from "../../../../lib/hooks/useProjectId";
import { objectQuery } from "../../api";

/**
 * Shows one object's details, loaded when the dialog opens, with each
 * metadata entry as its own row.
 */
export function ObjectDetailsDialog({
  container,
  object,
  onClose,
}: {
  container: string;
  object: StoreObject;
  onClose: () => void;
}) {
  const projectId = useProjectId();
  const detail = useQuery(objectQuery(projectId, container, object.name));
  return (
    <Modal
      isOpen
      onOpenChange={(open) => !open && onClose()}
      size="lg"
      isDismissable
    >
      <Dialog
        title={object.basename}
        closeLabel="Close"
        actions={
          <Button variant="secondary" slot="close">
            Close
          </Button>
        }
      >
        {detail.isPending ? (
          <SkeletonLines lines={5} />
        ) : detail.isError ? (
          <ErrorState error={detail.error} onRetry={() => detail.refetch()} />
        ) : (
          <KeyValueList
            items={[
              { label: "Name", value: <code>{detail.data.name}</code> },
              { label: "Size", value: formatBytes(detail.data.bytes) },
              { label: "Content type", value: detail.data.content_type },
              {
                label: "Hash",
                value: detail.data.hash ? (
                  <code>{detail.data.hash}</code>
                ) : null,
              },
              {
                label: "Last modified",
                value: formatDateTime(detail.data.last_modified),
              },
              {
                label: "Large object",
                value: detail.data.is_slo ? "Yes (stored in segments)" : "No",
              },
              ...(detail.data.orig_filename
                ? [
                    {
                      label: "Original file name",
                      value: detail.data.orig_filename,
                    },
                  ]
                : []),
              ...Object.entries(detail.data.metadata).map(([key, value]) => ({
                label: `Metadata: ${key}`,
                value,
              })),
            ]}
          />
        )}
      </Dialog>
    </Modal>
  );
}
