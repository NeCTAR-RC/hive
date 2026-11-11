// One container: its folders and objects at the current path, with
// upload, folder creation, download, copy and delete, plus the public
// access toggle (Horizon project/containers objects view).
import { useMemo, useState } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Alert, Button } from "@ardc-ui/react";
import { DELETE } from "../../../components/BulkAction/messages";
import { useBulkAction } from "../../../components/BulkAction/useBulkAction";
import { DataTable } from "../../../components/DataTable/DataTable";
import type { TableSearch } from "../../../components/DataTable/queryTable";
import { useQueryTable } from "../../../components/DataTable/useQueryTable";
import { toRowActions } from "../../../lib/actions";
import type { StoreObject } from "../../../lib/api/types/objectstore";
import { downloadUrl } from "../../../lib/download";
import { useProjectId } from "../../../lib/hooks/useProjectId";
import { DetailPage } from "../../../shell/DetailPage/DetailPage";
import type { Crumb } from "../../../shell/PageHeader/PageHeader";
import {
  containerQuery,
  containerWriteKeys,
  deleteObjects,
  downloadPath,
  folderHref,
  joinListing,
  objectsQuery,
} from "../api";
import { availableObjectActions, type ObjectActionId } from "../status";
import { ContainerSummary } from "./ContainerSummary";
import { CopyObjectDialog } from "./dialogs/CopyObjectDialog";
import { CreateFolderDialog } from "./dialogs/CreateFolderDialog";
import { ObjectDetailsDialog } from "./dialogs/ObjectDetailsDialog";
import { UploadDialog } from "./dialogs/UploadDialog";
import { useObjectColumns } from "./useObjectColumns";
import styles from "../ObjectStore.module.scss";

type Dialog =
  | { kind: "upload" }
  | { kind: "folder" }
  | { kind: "details"; object: StoreObject }
  | { kind: "copy"; object: StoreObject }
  | null;

/** An object's full name, which is also its id. */
const getName = (object: StoreObject) => object.name;

/**
 * The page itself, for the top level (`path` blank) or a folder; each
 * route reads its own params and search and hands them over.
 */
export function ContainerView({
  container,
  path,
  search,
}: {
  container: string;
  path: string;
  search: TableSearch;
}) {
  const projectId = useProjectId();
  const prefix = path ? `${path}/` : "";
  const navigate = useNavigate();
  const detail = useQuery(containerQuery(projectId, container));
  // Past the backend's page of 500 entries the folder loads on demand.
  const objects = useInfiniteQuery({
    ...objectsQuery(projectId, container, path),
    select: joinListing,
  });
  const table = useQueryTable(objects, {
    noun: "objects",
    emptyTitle: "This folder is empty",
    noMatchTitle: "Nothing matches",
    search,
    placeholder: "Search this folder",
    resetKey: path,
  });
  const [dialog, setDialog] = useState<Dialog>(null);
  // The full names in this folder, so a copy or an upload can tell a name
  // that is already taken.
  const taken = useMemo(
    () => new Set((objects.data?.items ?? []).map(getName)),
    [objects.data],
  );
  const remove = useBulkAction<StoreObject, "delete">({
    noun: { one: "object", many: "objects" },
    name: (object) => object.basename,
    getId: getName,
    invalidates: containerWriteKeys(container),
    actions: {
      delete: {
        verb: DELETE,
        batch: (objects) => deleteObjects(container, objects),
        title: (objects) => {
          const [only] = objects;
          if (objects.length !== 1 || !only) {
            return `Delete ${objects.length} items?`;
          }
          return only.is_folder
            ? `Delete ${only.basename} and everything in it?`
            : `Delete ${only.basename}?`;
        },
        body: (
          <p>
            Folders are deleted with all of their contents. This cannot be
            undone.
          </p>
        ),
      },
    },
  });

  const crumbs: Crumb[] = [
    { label: "Project" },
    { label: "Object store" },
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

  const columns = useObjectColumns(container, prefix);

  const title = path ? (segments[segments.length - 1] ?? container) : container;

  /** Runs one row menu action on `object`. */
  const runAction = (id: ObjectActionId, object: StoreObject) => {
    if (id === "open") {
      void navigate({
        to: folderHref(container, `${prefix}${object.basename}`),
      });
    } else if (id === "download") {
      downloadUrl(downloadPath(container, object.name), object.basename);
    } else if (id === "details" || id === "copy") {
      setDialog({ kind: id, object });
    } else {
      remove.run("delete", [object]);
    }
  };

  return (
    <>
      <DetailPage
        query={detail}
        noun="container"
        id={container}
        idIsName
        crumbs={crumbs}
        backTo={{ label: "containers", href: "/object-store/containers" }}
        title={() => title}
        actions={() => (
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
        )}
      >
        {(data) => (
          <div className={styles.layout}>
            <div className={styles.main}>
              {objects.hasNextPage && (
                <Alert tone="info" role="status">
                  The first {objects.data?.items.length} entries are shown, and
                  the search covers only these. Load more to see the rest.
                </Alert>
              )}
              <DataTable
                id="objects"
                label="Objects"
                columns={columns}
                getRowId={getName}
                {...table}
                {...remove.tableProps}
                emptyBody={
                  <p>Upload files or create a folder to get started.</p>
                }
                defaultSort={{ column: "name", direction: "ascending" }}
                rowActions={(row) =>
                  toRowActions(availableObjectActions(row), (id) =>
                    runAction(id, row),
                  )
                }
                batchActions={[
                  {
                    id: "delete",
                    label: "Delete",
                    tone: "danger",
                    onAction: (selected) => remove.run("delete", selected),
                  },
                ]}
              />
              {objects.hasNextPage && (
                <div>
                  <Button
                    variant="secondary"
                    size="sm"
                    onPress={() => void objects.fetchNextPage()}
                    isDisabled={objects.isFetchingNextPage}
                  >
                    {objects.isFetchingNextPage ? "Loading..." : "Load more"}
                  </Button>
                </div>
              )}
            </div>
            <ContainerSummary container={container} data={data} />
          </div>
        )}
      </DetailPage>
      {dialog?.kind === "upload" && (
        <UploadDialog
          container={container}
          prefix={prefix}
          taken={taken}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === "folder" && (
        <CreateFolderDialog
          container={container}
          prefix={prefix}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === "details" && (
        <ObjectDetailsDialog
          container={container}
          object={dialog.object}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === "copy" && (
        <CopyObjectDialog
          container={container}
          object={dialog.object}
          taken={taken}
          onClose={() => setDialog(null)}
        />
      )}
      {remove.dialog}
    </>
  );
}
