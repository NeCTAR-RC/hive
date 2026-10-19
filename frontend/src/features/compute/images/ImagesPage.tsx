import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Button, Label, Select, SelectItem } from "@ardc-ui/react";
import type { Key } from "@ardc-ui/react";
import { ConfirmDialog } from "../../../components/ConfirmDialog/ConfirmDialog";
import {
  DataTable,
  type ColumnDef,
} from "../../../components/DataTable/DataTable";
import { StatusPill } from "../../../components/StatusPill/StatusPill";
import type { Image } from "../../../lib/api/types";
import { formatBytes, formatRelative } from "../../../lib/format";
import { notify } from "../../../lib/notify";
import { useProjectId } from "../../../lib/useProject";
import { PageHeader } from "../../../shell/PageHeader/PageHeader";
import { imagesRoute } from "../../../app/router";
import { imagesQuery, useDeleteImages } from "../api";
import { CreateImageDialog, EditImageDialog } from "./ImageDialogs";
import { imageStatusTone, visibilityLabel } from "./presentation";
import styles from "./ImagesPage.module.scss";
import { RouteLink } from "../../../components/RouteLink/RouteLink";

const VISIBILITY_FILTERS = [
  { id: "", label: "All visibilities" },
  { id: "private", label: "Project" },
  { id: "shared", label: "Shared with me" },
  { id: "public", label: "Public" },
  { id: "community", label: "Community" },
];

export function ImagesPage() {
  const projectId = useProjectId();
  const search = imagesRoute.useSearch();
  const navigate = useNavigate({ from: imagesRoute.fullPath });
  const q = search.q ?? "";
  const visibility = search.visibility ?? "";
  const snapshots = search.snapshots ?? false;
  const images = useQuery(
    imagesQuery(projectId, {
      ...(visibility ? { visibility } : {}),
      ...(q ? { q } : {}),
      snapshots,
    }),
  );
  const remove = useDeleteImages(projectId);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Image | null>(null);
  const [deleting, setDeleting] = useState<Image[]>([]);

  const setSearch = (patch: {
    q?: string;
    visibility?: string;
    snapshots?: boolean;
  }) =>
    void navigate({
      search: (previous) => {
        const next = { ...previous, ...patch };
        if (!next.q) delete next.q;
        if (!next.visibility) delete next.visibility;
        if (!next.snapshots) delete next.snapshots;
        return next;
      },
      replace: true,
    });

  const columns = useMemo<ColumnDef<Image>[]>(
    () => [
      {
        id: "name",
        label: "Name",
        isRowHeader: true,
        cell: (row) => (
          <RouteLink to="/compute/images/$imageId" params={{ imageId: row.id }}>
            {row.name ?? row.id}
          </RouteLink>
        ),
        sortValue: (row) => row.name ?? "",
      },
      {
        id: "status",
        label: "Status",
        cell: (row) => (
          <StatusPill tone={imageStatusTone(row.status)}>
            {row.status}
          </StatusPill>
        ),
        sortValue: (row) => row.status,
      },
      {
        id: "visibility",
        label: "Visibility",
        cell: (row) => visibilityLabel(row),
        sortValue: (row) => visibilityLabel(row),
        hideBelow: "md",
      },
      {
        id: "protected",
        label: "Protected",
        cell: (row) => (row.protected ? "Yes" : "No"),
        sortValue: (row) => (row.protected ? 1 : 0),
        hideBelow: "lg",
      },
      {
        id: "disk_format",
        label: "Format",
        cell: (row) => (row.disk_format ?? "").toUpperCase(),
        sortValue: (row) => row.disk_format ?? "",
        hideBelow: "lg",
      },
      {
        id: "size",
        label: "Size",
        cell: (row) => formatBytes(row.size),
        sortValue: (row) => row.size ?? 0,
        hideBelow: "md",
      },
      {
        id: "created_at",
        label: "Age",
        cell: (row) =>
          row.created_at ? (
            <time dateTime={row.created_at} title={row.created_at}>
              {formatRelative(row.created_at)}
            </time>
          ) : (
            ""
          ),
        sortValue: (row) => row.created_at ?? "",
        hideBelow: "lg",
      },
    ],
    [],
  );

  const confirmDelete = async () => {
    try {
      await remove.mutateAsync(deleting.map((i) => i.id));
      notify.success(
        deleting.length === 1
          ? `Image ${deleting[0]?.name} deleted.`
          : `${deleting.length} images deleted.`,
      );
      setDeleting([]);
    } catch (error) {
      notify.danger(`Could not delete: ${(error as Error).message}`);
      setDeleting([]);
    }
  };

  return (
    <>
      <PageHeader
        title="Images"
        crumbs={[{ label: "Project" }, { label: "Compute" }]}
        actions={
          <Button size="sm" onPress={() => setCreating(true)}>
            Create image
          </Button>
        }
      />
      <DataTable
        id="images"
        label="Images"
        columns={columns}
        rows={images.data?.items}
        getRowId={(row) => row.id}
        isLoading={images.isPending}
        isFetching={images.isFetching}
        error={images.error}
        onRetry={() => void images.refetch()}
        onRefresh={() => void images.refetch()}
        search={{
          value: q,
          onChange: (value) => setSearch({ q: value }),
          placeholder:
            "Search images (community images appear when you search)",
        }}
        resetKey={`${q}|${visibility}|${snapshots}`}
        filters={
          <>
            <Select
              aria-label="Type"
              labelPosition="side"
              className={styles.filter}
              selectedKey={snapshots ? "snapshots" : "images"}
              onSelectionChange={(key: Key | null) =>
                setSearch({ snapshots: key === "snapshots" })
              }
            >
              <Label>Type</Label>
              <SelectItem id="images" textValue="Images">
                Images
              </SelectItem>
              <SelectItem id="snapshots" textValue="Instance snapshots">
                Instance snapshots
              </SelectItem>
            </Select>
            <Select
              aria-label="Visibility"
              labelPosition="side"
              className={styles.filter}
              selectedKey={visibility}
              onSelectionChange={(key: Key | null) =>
                setSearch({ visibility: key === null ? "" : String(key) })
              }
            >
              <Label>Visibility</Label>
              {VISIBILITY_FILTERS.map((option) => (
                <SelectItem
                  key={option.id}
                  id={option.id}
                  textValue={option.label}
                >
                  {option.label}
                </SelectItem>
              ))}
            </Select>
          </>
        }
        emptyTitle={snapshots ? "No snapshots" : "No images match"}
        emptyBody={
          !q && !visibility ? (
            <p>
              Community images from other projects appear once you search for
              them by name.
            </p>
          ) : null
        }
        defaultSort={{ column: "name", direction: "ascending" }}
        rowActions={(row) => [
          {
            id: "launch",
            label: "Launch instance",
            onAction: () =>
              void navigate({
                to: "/compute/instances/launch",
                search: {
                  source: `${row.is_snapshot ? "snapshot" : "image"}:${row.id}`,
                },
              }),
            isDisabled: row.status !== "active",
            disabledReason: "The image is not active yet",
          },
          {
            id: "edit",
            label: "Edit image",
            onAction: () => setEditing(row),
            isDisabled: !row.is_owner,
            disabledReason: "Only the owning project can edit this image",
          },
          {
            id: "delete",
            label: "Delete image",
            tone: "danger",
            onAction: () => setDeleting([row]),
            isDisabled: !row.is_owner || row.protected,
            disabledReason: row.protected
              ? "The image is protected"
              : "Only the owning project can delete this image",
          },
        ]}
        batchActions={[
          {
            id: "delete",
            label: "Delete",
            tone: "danger",
            onAction: (rows) => setDeleting(rows),
            isDisabled: (rows) =>
              rows.some((row) => !row.is_owner || row.protected),
          },
        ]}
      />
      <CreateImageDialog
        projectId={projectId}
        isOpen={creating}
        onOpenChange={setCreating}
      />
      {editing && (
        <EditImageDialog
          projectId={projectId}
          image={editing}
          onClose={() => setEditing(null)}
        />
      )}
      <ConfirmDialog
        isOpen={deleting.length > 0}
        onOpenChange={(open) => !open && setDeleting([])}
        title={
          deleting.length === 1
            ? `Delete image ${deleting[0]?.name}?`
            : `Delete ${deleting.length} images?`
        }
        confirmLabel="Delete"
        isPending={remove.isPending}
        onConfirm={() => void confirmDelete()}
      >
        <p>
          Instances already running from the image are not affected. This cannot
          be undone.
        </p>
      </ConfirmDialog>
    </>
  );
}
