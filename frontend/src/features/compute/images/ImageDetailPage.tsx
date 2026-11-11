import { useQuery } from "@tanstack/react-query";
import { getRouteApi, useNavigate } from "@tanstack/react-router";
import { RowActionsMenu } from "../../../components/DataTable/RowActionsMenu";
import { KeyValueList } from "../../../components/KeyValueList/KeyValueList";
import { Panel } from "../../../components/Panel/Panel";
import { StatusPill } from "../../../components/StatusPill/StatusPill";
import { toRowActions } from "../../../lib/actions";
import type { Image } from "../../../lib/api/types/compute";
import { formatBytes, formatDateTime, formatMb } from "../../../lib/format";
import { useProjectId } from "../../../lib/hooks/useProjectId";
import { DetailPage } from "../../../shell/DetailPage/DetailPage";
import { imageQuery } from "../api";
import { DESCRIPTION, imageDescription } from "./dialogs/request";
import { useImageActions } from "./ImageActions";
import {
  availableImageActions,
  imageStatusTone,
  visibilityLabel,
} from "./presentation";
import styles from "./ImageDetailPage.module.scss";

const imageRoute = getRouteApi("/app/compute/images/$imageId");

const CRUMBS = [
  { label: "Project" },
  { label: "Compute" },
  { label: "Images", href: "/compute/images" },
];

/** The custom properties but the description, which the Image panel shows. */
function properties(image: Image): [string, unknown][] {
  return Object.entries(image.properties).filter(
    ([key]) => key !== DESCRIPTION,
  );
}

/**
 * An image's page: its record (protection and checksum included), its
 * custom properties and the image's actions.
 */
export function ImageDetailPage() {
  const projectId = useProjectId();
  const { imageId } = imageRoute.useParams();
  const navigate = useNavigate();
  const image = useQuery(imageQuery(projectId, imageId));
  const { run, dialogs } = useImageActions(
    () => void navigate({ to: "/compute/images", search: {} }),
  );

  return (
    <>
      <DetailPage
        query={image}
        noun="image"
        id={imageId}
        scope="visible"
        crumbs={CRUMBS}
        backTo={{ label: "images", href: "/compute/images" }}
        title={(data) => data.name ?? "Image"}
        actions={(data) => (
          <RowActionsMenu
            actions={toRowActions(availableImageActions(data), (id) =>
              run(id, [data]),
            )}
          />
        )}
        meta={(data) => (
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
      >
        {(data) => (
          <div className={styles.grid}>
            <Panel title="Image">
              <KeyValueList
                items={[
                  { label: "Name", value: data.name },
                  { label: "Description", value: imageDescription(data) },
                  { label: "ID", value: <code>{data.id}</code> },
                  { label: "Owner project", value: <code>{data.owner}</code> },
                  { label: "Visibility", value: visibilityLabel(data) },
                  { label: "Status", value: data.status },
                  {
                    label: "Protected",
                    value: data.protected ? "Yes (it cannot be deleted)" : "No",
                  },
                  { label: "Size", value: formatBytes(data.size) },
                  {
                    label: "Checksum",
                    value: data.checksum ? <code>{data.checksum}</code> : null,
                  },
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
            </Panel>
            <Panel title="Properties">
              {properties(data).length === 0 && data.tags.length === 0 ? (
                <p className={styles.muted}>No custom properties.</p>
              ) : (
                <KeyValueList
                  items={[
                    ...(data.tags.length
                      ? [{ label: "Tags", value: data.tags.join(", ") }]
                      : []),
                    ...properties(data).map(([key, value]) => ({
                      label: key,
                      value:
                        typeof value === "string"
                          ? value
                          : JSON.stringify(value),
                    })),
                  ]}
                />
              )}
            </Panel>
          </div>
        )}
      </DetailPage>
      {dialogs}
    </>
  );
}
