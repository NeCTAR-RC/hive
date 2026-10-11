// One container: its folders and objects at the current path, with
// upload, folder creation, download, copy and delete, plus the public
// access toggle (Horizon project/containers objects view).
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Link as RouterLink,
  useNavigate,
  useParams,
} from "@tanstack/react-router";
import { Alert, Button, Switch } from "@ardc-ui/react";
import { ConfirmDialog } from "../../components/ConfirmDialog/ConfirmDialog";
import { CopyButton } from "../../components/CopyButton/CopyButton";
import {
  DataTable,
  type ColumnDef,
} from "../../components/DataTable/DataTable";
import { filterRows } from "../../components/DataTable/filter";
import { ErrorState } from "../../components/ErrorState/ErrorState";
import { Panel } from "../../components/Panel/Panel";
import { SkeletonLines } from "../../components/Skeleton/Skeleton";
import type { StoreObject } from "../../lib/api/types";
import { downloadUrl } from "../../lib/download";
import { formatBytes, formatDateTime } from "../../lib/format";
import { notify } from "../../lib/notify";
import { useProjectId } from "../../lib/useProject";
import { PageHeader, type Crumb } from "../../shell/PageHeader/PageHeader";
import {
  containerQuery,
  downloadPath,
  folderHref,
  objectsQuery,
  useDeleteObjects,
  useUpdateContainer,
} from "./api";
import {
  CopyObjectDialog,
  CreateFolderDialog,
  ObjectDetailsDialog,
  UploadDialog,
} from "./ObjectStoreDialogs";
import styles from "./ObjectStore.module.scss";

type Dialog =
  | { kind: "upload" }
  | { kind: "folder" }
  | { kind: "details"; object: StoreObject }
  | { kind: "copy"; object: StoreObject }
  | null;

export function ContainerPage() {
  const projectId = useProjectId();
  const params = useParams({ strict: false }) as {
    container?: string;
    _splat?: string;
  };
  const container = params.container ?? "";
  const path = (params._splat ?? "").replace(/^\/+|\/+$/g, "");
  const prefix = path ? `${path}/` : "";
  const navigate = useNavigate();
  const detail = useQuery(containerQuery(projectId, container));
  const objects = useQuery(objectsQuery(projectId, container, path));
  const update = useUpdateContainer(projectId);
  const remove = useDeleteObjects(projectId);
  const [query, setQuery] = useState("");
  const [dialog, setDialog] = useState<Dialog>(null);
  const [deleting, setDeleting] = useState<StoreObject[]>([]);

  const crumbs: Crumb[] = [
    { label: "Project" },
    { label: "Object Store" },
    { label: "Containers", href: "/object-store/containers" },
  ];
  if (path) crumbs.push({ label: container, href: folderHref(container, "") });
  const segments = path ? path.split("/") : [];
  segments.slice(0, -1).forEach((segment, index) => {
    crumbs.push({
      label: segment,
      href: folderHref(container, segments.slice(0, index + 1).join("/")),
    });
  });

  const columns = useMemo<ColumnDef<StoreObject>[]>(
    () => [
      {
        id: "name",
        label: "Name",
        isRowHeader: true,
        cell: (row) =>
          row.is_folder ? (
            <RouterLink
              to={folderHref(container, `${prefix}${row.basename}`)}
              className={styles.nameLink}
            >
              {row.basename}/
            </RouterLink>
          ) : (
            <span>{row.basename}</span>
          ),
        sortValue: (row) => `${row.is_folder ? "0" : "1"}${row.basename}`,
        textValue: (row) => row.basename,
      },
      {
        id: "size",
        label: "Size",
        cell: (row) => (row.is_folder ? "Folder" : formatBytes(row.bytes)),
        sortValue: (row) => (row.is_folder ? -1 : row.bytes),
      },
      {
        id: "modified",
        label: "Modified",
        cell: (row) => formatDateTime(row.last_modified),
        sortValue: (row) => row.last_modified ?? "",
        hideBelow: "md",
      },
      {
        id: "type",
        label: "Type",
        cell: (row) => (row.is_folder ? "" : (row.content_type ?? "")),
        hideBelow: "lg",
      },
    ],
    [container, prefix],
  );
  const rows = useMemo(
    () => filterRows(objects.data?.items ?? [], query, columns),
    [objects.data, query, columns],
  );

  const confirmDelete = () => {
    const names = deleting.map((o) => o.name);
    remove.mutate(
      { container, names },
      {
        onSuccess: (result) => {
          if (result.failed.length === 0) {
            notify.success(
              names.length === 1
                ? `Deleted ${deleting[0]?.basename}.`
                : `Deleted ${result.deleted} objects.`,
            );
          } else {
            notify.danger(
              `Deleted ${result.deleted} objects; ${result.failed.length} could not be deleted.`,
            );
          }
          setDeleting([]);
        },
      },
    );
  };

  const title = path ? (segments[segments.length - 1] ?? container) : container;

  return (
    <>
      <PageHeader
        title={title}
        crumbs={crumbs}
        actions={
          <>
            <Button
              variant="secondary"
              size="sm"
              onPress={() => setDialog({ kind: "folder" })}
            >
              Create folder
            </Button>
            <Button size="sm" onPress={() => setDialog({ kind: "upload" })}>
              Upload files
            </Button>
          </>
        }
      />
      <div className={styles.layout}>
        <div className={styles.main}>
          {objects.data?.has_more && (
            <Alert tone="info" role="status">
              Only the first {objects.data.items.length} entries are shown. Open
              a folder to see more.
            </Alert>
          )}
          <DataTable
            id="objects"
            label="Objects"
            columns={columns}
            rows={rows}
            getRowId={(row) => row.name}
            isLoading={objects.isPending}
            isFetching={objects.isFetching}
            error={objects.error}
            onRetry={() => void objects.refetch()}
            onRefresh={() => void objects.refetch()}
            search={{
              value: query,
              onChange: setQuery,
              placeholder: "Filter this folder",
            }}
            resetKey={`${path}|${query}`}
            emptyTitle={
              objects.data?.items.length
                ? "Nothing matches"
                : "This folder is empty"
            }
            emptyBody={
              objects.data?.items.length === 0 ? (
                <p>Upload files or create a folder to get started.</p>
              ) : null
            }
            defaultSort={{ column: "name", direction: "ascending" }}
            rowActions={(row) =>
              row.is_folder
                ? [
                    {
                      id: "open",
                      label: "Open folder",
                      onAction: () =>
                        void navigate({
                          to: folderHref(container, `${prefix}${row.basename}`),
                        }),
                    },
                    {
                      id: "delete",
                      label: "Delete folder and contents",
                      tone: "danger",
                      onAction: () => setDeleting([row]),
                    },
                  ]
                : [
                    {
                      id: "download",
                      label: "Download",
                      onAction: () =>
                        downloadUrl(
                          downloadPath(container, row.name),
                          row.basename,
                        ),
                    },
                    {
                      id: "details",
                      label: "View details",
                      onAction: () =>
                        setDialog({ kind: "details", object: row }),
                    },
                    {
                      id: "copy",
                      label: "Copy",
                      isDisabled: row.bytes === 0,
                      disabledReason: "Empty objects cannot be copied.",
                      onAction: () => setDialog({ kind: "copy", object: row }),
                    },
                    {
                      id: "delete",
                      label: "Delete",
                      tone: "danger",
                      onAction: () => setDeleting([row]),
                    },
                  ]
            }
            batchActions={[
              {
                id: "delete",
                label: "Delete",
                tone: "danger",
                onAction: (selected) => setDeleting(selected),
              },
            ]}
          />
        </div>
        <Panel title="Container" className={styles.side}>
          {detail.isPending ? (
            <SkeletonLines lines={4} />
          ) : detail.isError ? (
            <ErrorState error={detail.error} onRetry={() => detail.refetch()} />
          ) : (
            <dl className={styles.facts}>
              <dt>Objects</dt>
              <dd>{detail.data.object_count}</dd>
              <dt>Size</dt>
              <dd>{formatBytes(detail.data.bytes)}</dd>
              {detail.data.storage_policy && (
                <>
                  <dt>Storage policy</dt>
                  <dd>{detail.data.storage_policy}</dd>
                </>
              )}
              <dt>Public access</dt>
              <dd>
                <Switch
                  isSelected={detail.data.is_public}
                  isDisabled={update.isPending}
                  onChange={(selected) =>
                    update.mutate(
                      { container, is_public: selected },
                      {
                        onSuccess: () =>
                          notify.success(
                            selected
                              ? `${container} is now public.`
                              : `${container} is now private.`,
                          ),
                      },
                    )
                  }
                >
                  {detail.data.is_public ? "Enabled" : "Disabled"}
                </Switch>
                {update.isError && (
                  <ErrorState
                    error={update.error}
                    title="Could not change access"
                  />
                )}
              </dd>
              {detail.data.is_public && (
                <>
                  <dt>Public URL</dt>
                  <dd className={styles.url}>
                    <a href={detail.data.public_url}>
                      {detail.data.public_url}
                    </a>
                    <CopyButton
                      text={detail.data.public_url}
                      label="Copy URL"
                    />
                  </dd>
                </>
              )}
            </dl>
          )}
        </Panel>
      </div>
      <UploadDialog
        projectId={projectId}
        container={container}
        prefix={prefix}
        isOpen={dialog?.kind === "upload"}
        onOpenChange={(open) => !open && setDialog(null)}
      />
      <CreateFolderDialog
        projectId={projectId}
        container={container}
        prefix={prefix}
        isOpen={dialog?.kind === "folder"}
        onOpenChange={(open) => !open && setDialog(null)}
      />
      {dialog?.kind === "details" && (
        <ObjectDetailsDialog
          projectId={projectId}
          container={container}
          object={dialog.object}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === "copy" && (
        <CopyObjectDialog
          projectId={projectId}
          container={container}
          object={dialog.object}
          onClose={() => setDialog(null)}
        />
      )}
      <ConfirmDialog
        isOpen={deleting.length > 0}
        onOpenChange={(open) => !open && setDeleting([])}
        title={
          deleting.length === 1
            ? `Delete ${deleting[0]?.basename}${deleting[0]?.is_folder ? " and everything in it" : ""}?`
            : `Delete ${deleting.length} items?`
        }
        confirmLabel="Delete"
        isPending={remove.isPending}
        error={remove.error}
        onConfirm={confirmDelete}
      >
        <p>
          Folders are deleted with all of their contents. This cannot be undone.
        </p>
      </ConfirmDialog>
    </>
  );
}
