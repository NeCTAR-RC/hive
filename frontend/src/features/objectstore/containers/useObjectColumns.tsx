// The object table's columns: folders link one level down, so the columns
// depend on the container and the current folder.
import { useMemo } from "react";
import { AppLink } from "../../../components/AppLink/AppLink";
import type { ColumnDef } from "../../../components/DataTable/DataTable";
import type { StoreObject } from "../../../lib/api/types/objectstore";
import { formatBytes, formatDateTime } from "../../../lib/format";
import { folderHref } from "../api";

/**
 * The columns for the objects at `prefix` in `container`: name (a link for
 * a folder), size, modified time and content type. Folders sort first.
 */
export function useObjectColumns(
  container: string,
  prefix: string,
): ColumnDef<StoreObject>[] {
  return useMemo<ColumnDef<StoreObject>[]>(
    () => [
      {
        id: "name",
        label: "Name",
        isRowHeader: true,
        cell: (row) =>
          row.is_folder ? (
            <AppLink
              size="sm"
              to={folderHref(container, `${prefix}${row.basename}`)}
            >
              {row.basename}/
            </AppLink>
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
}
