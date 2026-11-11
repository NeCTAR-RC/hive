// The image list: the project's images or instance snapshots, filtered by
// visibility and searched on the image service.
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getRouteApi } from "@tanstack/react-router";
import { Button, Label, Select, SelectItem } from "@ardc-ui/react";
import type { Key } from "@ardc-ui/react";
import { DataTable } from "../../../components/DataTable/DataTable";
import { useQueryTable } from "../../../components/DataTable/useQueryTable";
import { allows, toRowActions } from "../../../lib/actions";
import { useListSearch } from "../../../lib/hooks/useListSearch";
import { useProjectId } from "../../../lib/hooks/useProjectId";
import { PageHeader } from "../../../shell/PageHeader/PageHeader";
import { imagesQuery } from "../api";
import { useImageActions } from "./ImageActions";
import { CreateImageDialog } from "./dialogs/CreateImageDialog";
import { imageColumns } from "./imageColumns";
import { availableImageActions } from "./presentation";

const imagesRoute = getRouteApi("/app/compute/images");

const VISIBILITY_FILTERS = [
  { id: "", label: "All visibilities" },
  { id: "private", label: "Project" },
  { id: "shared", label: "Shared with me" },
  { id: "public", label: "Public" },
  { id: "community", label: "Community" },
];

/**
 * The project's images, or its instance snapshots, from the image service.
 * Search runs on the service, so community images of other projects
 * appear once the user searches for them.
 */
export function ImagesPage() {
  const projectId = useProjectId();
  const search = useListSearch(imagesRoute);
  const q = search.text;
  const visibility = search.params.visibility ?? "";
  const snapshots = search.params.snapshots ?? false;
  const images = useQuery(
    imagesQuery(projectId, {
      ...(visibility ? { visibility } : {}),
      ...(q ? { q } : {}),
      snapshots,
    }),
  );
  const table = useQueryTable(images, {
    noun: "images",
    emptyTitle: snapshots ? "No snapshots" : "No images match",
    search,
    placeholder: "Search images (community images appear when you search)",
    remoteSearch: true,
    resetKey: `${visibility}|${snapshots}`,
  });
  const [creating, setCreating] = useState(false);
  const { run, dialogs, tableProps } = useImageActions();

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
        columns={imageColumns}
        getRowId={(row) => row.id}
        {...table}
        {...tableProps}
        filters={
          <>
            <Select
              aria-label="Type"
              labelPosition="side"
              selectedKey={snapshots ? "snapshots" : "images"}
              onSelectionChange={(key: Key | null) =>
                search.patch({ snapshots: key === "snapshots" })
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
              selectedKey={visibility}
              onSelectionChange={(key: Key | null) =>
                search.patch({ visibility: key === null ? "" : String(key) })
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
        emptyBody={
          !q && !visibility ? (
            <p>
              Community images from other projects appear once you search for
              them by name.
            </p>
          ) : null
        }
        defaultSort={{ column: "name", direction: "ascending" }}
        rowActions={(row) =>
          toRowActions(availableImageActions(row), (id) => run(id, [row]))
        }
        batchActions={[
          {
            id: "delete",
            label: "Delete",
            tone: "danger",
            onAction: (rows) => run("delete", rows),
            isDisabled: (rows) =>
              !rows.some((row) => allows(availableImageActions(row), "delete")),
          },
        ]}
      />
      {creating && <CreateImageDialog onClose={() => setCreating(false)} />}
      {dialogs}
    </>
  );
}
