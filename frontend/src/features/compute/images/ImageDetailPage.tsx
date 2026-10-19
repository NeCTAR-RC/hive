import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { ConfirmDialog } from "../../../components/ConfirmDialog/ConfirmDialog";
import { RowActionsMenu } from "../../../components/DataTable/DataTable";
import { ErrorState } from "../../../components/ErrorState/ErrorState";
import { KeyValueList } from "../../../components/KeyValueList/KeyValueList";
import { Panel } from "../../../components/Panel/Panel";
import { SkeletonLines } from "../../../components/Skeleton/Skeleton";
import { StatusPill } from "../../../components/StatusPill/StatusPill";
import { ApiError } from "../../../lib/api/client";
import { formatBytes, formatDateTime, formatMb } from "../../../lib/format";
import { notify } from "../../../lib/notify";
import { useProjectId } from "../../../lib/useProject";
import { PageHeader } from "../../../shell/PageHeader/PageHeader";
import { imageRoute } from "../../../app/router";
import { imageQuery, useDeleteImages } from "../api";
import { EditImageDialog } from "./ImageDialogs";
import { imageStatusTone, visibilityLabel } from "./presentation";
import styles from "./ImageDetailPage.module.scss";
import { RouteLink } from "../../../components/RouteLink/RouteLink";

const CRUMBS = [
  { label: "Project" },
  { label: "Compute" },
  { label: "Images", href: "/compute/images" },
];

export function ImageDetailPage() {
  const projectId = useProjectId();
  const { imageId } = imageRoute.useParams();
  const navigate = useNavigate();
  const image = useQuery(imageQuery(projectId, imageId));
  const remove = useDeleteImages(projectId);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);

  if (image.isError) {
    const notFound =
      image.error instanceof ApiError && image.error.status === 404;
    return (
      <>
        <PageHeader
          title={notFound ? "Image not found" : "Image"}
          crumbs={CRUMBS}
        />
        {notFound ? (
          <p>
            There is no image with id <code>{imageId}</code> visible to this
            project. <RouteLink to="/compute/images">Back to images</RouteLink>
          </p>
        ) : (
          <ErrorState
            error={image.error}
            onRetry={() => void image.refetch()}
          />
        )}
      </>
    );
  }

  const data = image.data;
  return (
    <>
      <PageHeader
        title={data?.name ?? "Image"}
        crumbs={CRUMBS}
        actions={
          data && (
            <RowActionsMenu
              actions={[
                {
                  id: "launch",
                  label: "Launch instance",
                  onAction: () =>
                    void navigate({
                      to: "/compute/instances/launch",
                      search: {
                        source: `${data.is_snapshot ? "snapshot" : "image"}:${data.id}`,
                      },
                    }),
                  isDisabled: data.status !== "active",
                  disabledReason: "The image is not active yet",
                },
                {
                  id: "edit",
                  label: "Edit image",
                  onAction: () => setEditing(true),
                  isDisabled: !data.is_owner,
                  disabledReason: "Only the owning project can edit this image",
                },
                {
                  id: "delete",
                  label: "Delete image",
                  tone: "danger",
                  onAction: () => setDeleting(true),
                  isDisabled: !data.is_owner || data.protected,
                  disabledReason: data.protected
                    ? "The image is protected"
                    : "Only the owning project can delete this image",
                },
              ]}
            />
          )
        }
      >
        {data && (
          <div className={styles.statusRow}>
            <StatusPill tone={imageStatusTone(data.status)}>
              {data.status}
            </StatusPill>
            <span className={styles.muted}>{visibilityLabel(data)}</span>
            {data.is_snapshot && (
              <StatusPill tone="info">Instance snapshot</StatusPill>
            )}
            {data.protected && (
              <StatusPill tone="neutral">Protected</StatusPill>
            )}
          </div>
        )}
      </PageHeader>
      <div className={styles.grid}>
        <Panel title="Image">
          {!data ? (
            <SkeletonLines lines={8} />
          ) : (
            <KeyValueList
              items={[
                { label: "Name", value: data.name },
                { label: "ID", value: <code>{data.id}</code> },
                { label: "Owner project", value: <code>{data.owner}</code> },
                { label: "Visibility", value: visibilityLabel(data) },
                { label: "Status", value: data.status },
                { label: "Size", value: formatBytes(data.size) },
                {
                  label: "Disk format",
                  value: data.disk_format?.toUpperCase(),
                },
                { label: "Container format", value: data.container_format },
                {
                  label: "Minimum disk",
                  value: data.min_disk ? `${data.min_disk} GB` : "None",
                },
                {
                  label: "Minimum RAM",
                  value: data.min_ram ? formatMb(data.min_ram) : "None",
                },
                { label: "Created", value: formatDateTime(data.created_at) },
                { label: "Updated", value: formatDateTime(data.updated_at) },
              ]}
            />
          )}
        </Panel>
        <Panel title="Properties">
          {!data ? (
            <SkeletonLines lines={4} />
          ) : Object.keys(data.properties).length === 0 &&
            data.tags.length === 0 ? (
            <p className={styles.muted}>No custom properties.</p>
          ) : (
            <KeyValueList
              items={[
                ...(data.tags.length
                  ? [{ label: "Tags", value: data.tags.join(", ") }]
                  : []),
                ...Object.entries(data.properties).map(([key, value]) => ({
                  label: key,
                  value:
                    typeof value === "string" ? value : JSON.stringify(value),
                })),
              ]}
            />
          )}
        </Panel>
      </div>
      {editing && data && (
        <EditImageDialog
          projectId={projectId}
          image={data}
          onClose={() => setEditing(false)}
        />
      )}
      <ConfirmDialog
        isOpen={deleting}
        onOpenChange={setDeleting}
        title={`Delete image ${data?.name ?? ""}?`}
        confirmLabel="Delete"
        isPending={remove.isPending}
        error={remove.error}
        onConfirm={() => {
          if (!data) return;
          remove.mutate([data.id], {
            onSuccess: () => {
              notify.success(`Image ${data.name} deleted.`);
              void navigate({ to: "/compute/images", search: {} });
            },
          });
        }}
      >
        <p>
          Instances already running from the image are not affected. This cannot
          be undone.
        </p>
      </ConfirmDialog>
    </>
  );
}
