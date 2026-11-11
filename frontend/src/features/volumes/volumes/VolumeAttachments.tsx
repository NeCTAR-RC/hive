// The attachments panel of a volume's detail page.
import { Button } from "@ardc-ui/react";
import { AppLink } from "../../../components/AppLink/AppLink";
import { Panel } from "../../../components/Panel/Panel";
import type { Volume } from "../../../lib/api/types/volumes";
import { formatDateTime } from "../../../lib/format";
import { RelatedList, RelatedRow } from "../../compute/RelatedList";
import { attachmentLabel } from "../status";
import styles from "./VolumeDetailPage.module.scss";

/**
 * The instances holding the volume, each linked and named from
 * `instanceNames` (instance id to name), with the button that opens the
 * manage attachments dialog.
 */
export function VolumeAttachments({
  volume,
  instanceNames,
  canManage,
  onManage,
}: {
  volume: Volume;
  instanceNames: ReadonlyMap<string, string>;
  canManage: boolean;
  onManage: () => void;
}) {
  return (
    <Panel
      title="Attachments"
      actions={
        <Button
          variant="secondary"
          size="xs"
          onPress={onManage}
          isDisabled={!canManage}
        >
          Manage attachments
        </Button>
      }
    >
      {volume.attachments.length === 0 ? (
        <p className={styles.muted}>Not attached to any instance.</p>
      ) : (
        <RelatedList>
          {volume.attachments.map((attachment) => (
            <RelatedRow
              key={attachment.id ?? attachment.server_id ?? ""}
              meta={
                attachment.attached_at
                  ? `Since ${formatDateTime(attachment.attached_at)}`
                  : undefined
              }
            >
              {attachment.server_id ? (
                <AppLink
                  to="/compute/instances/$instanceId"
                  params={{ instanceId: attachment.server_id }}
                >
                  {attachmentLabel(
                    attachment,
                    instanceNames.get(attachment.server_id),
                  )}
                </AppLink>
              ) : (
                attachmentLabel(attachment, undefined)
              )}
            </RelatedRow>
          ))}
        </RelatedList>
      )}
    </Panel>
  );
}
