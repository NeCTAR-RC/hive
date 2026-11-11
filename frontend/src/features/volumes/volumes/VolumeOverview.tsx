// The overview panel of a volume's detail page.
import { AppLink } from "../../../components/AppLink/AppLink";
import { KeyValueList } from "../../../components/KeyValueList/KeyValueList";
import { Panel } from "../../../components/Panel/Panel";
import type { Volume } from "../../../lib/api/types/volumes";
import { formatDateTime, formatGb } from "../../../lib/format";
import { MetadataList } from "../MetadataList";

/** What the volume was created from, linked: an image, a snapshot or a volume. */
function VolumeSource({ volume }: { volume: Volume }) {
  if (volume.image) {
    return (
      <>
        Image{" "}
        <AppLink
          to="/compute/images/$imageId"
          params={{ imageId: volume.image.id }}
        >
          {volume.image.name ?? volume.image.id}
        </AppLink>
      </>
    );
  }
  if (volume.snapshot_id) {
    return (
      <>
        Snapshot{" "}
        <AppLink
          to="/storage/snapshots/$snapshotId"
          params={{ snapshotId: volume.snapshot_id }}
        >
          {volume.snapshot_id}
        </AppLink>
      </>
    );
  }
  if (volume.source_volume_id) {
    return (
      <>
        Volume{" "}
        <AppLink
          to="/storage/volumes/$volumeId"
          params={{ volumeId: volume.source_volume_id }}
        >
          {volume.source_volume_id}
        </AppLink>
      </>
    );
  }
  return "Empty volume";
}

/**
 * The volume's properties, its source and its metadata, one pair per line.
 * The status is in the page header.
 */
export function VolumeOverview({ volume }: { volume: Volume }) {
  return (
    <Panel title="Overview">
      <KeyValueList
        items={[
          { label: "Name", value: volume.name },
          { label: "ID", value: <code>{volume.id}</code> },
          { label: "Description", value: volume.description },
          { label: "Size", value: formatGb(volume.size_gb) },
          { label: "Type", value: volume.volume_type },
          { label: "Bootable", value: volume.bootable ? "Yes" : "No" },
          { label: "Encrypted", value: volume.encrypted ? "Yes" : "No" },
          { label: "Availability zone", value: volume.availability_zone },
          { label: "Source", value: <VolumeSource volume={volume} /> },
          { label: "Created", value: formatDateTime(volume.created_at) },
          {
            label: "Metadata",
            value:
              Object.keys(volume.metadata).length === 0 ? null : (
                <MetadataList metadata={volume.metadata} />
              ),
          },
        ]}
      />
    </Panel>
  );
}
