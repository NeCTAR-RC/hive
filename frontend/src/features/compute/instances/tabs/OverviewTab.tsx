// The instance detail page's overview tab.
import { Fragment } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppLink } from "../../../../components/AppLink/AppLink";
import { KeyValueList } from "../../../../components/KeyValueList/KeyValueList";
import { Panel } from "../../../../components/Panel/Panel";
import type { InstanceDetail } from "../../../../lib/api/types/compute";
import {
  formatDateTime,
  formatGb,
  formatMb,
  formatSuRate,
} from "../../../../lib/format";
import { useProjectId } from "../../../../lib/hooks/useProjectId";
import { serverGroupsQuery } from "../../api";
import { powerStateLabel, statusLabel } from "../status";
import styles from "../InstanceDetailPage.module.scss";

/**
 * The instance at a glance: its record, its flavour's specs, boot image
 * and server groups (Nova's `server_groups`, each linked to its page by
 * name once the project's groups load), its addresses and its metadata,
 * each in a panel.
 */
export function OverviewTab({ instance }: { instance: InstanceDetail }) {
  const projectId = useProjectId();
  const groups = useQuery({
    ...serverGroupsQuery(projectId),
    enabled: instance.server_group_ids.length > 0,
  });
  const flavor = instance.flavor;
  return (
    <div className={styles.grid}>
      <Panel title="Instance">
        <KeyValueList
          items={[
            { label: "Name", value: instance.name },
            { label: "ID", value: <code>{instance.id}</code> },
            { label: "Description", value: instance.description },
            { label: "Status", value: statusLabel(instance) },
            { label: "Power state", value: powerStateLabel(instance) },
            { label: "Availability zone", value: instance.availability_zone },
            { label: "Locked", value: instance.locked ? "Yes" : "No" },
            { label: "Created", value: formatDateTime(instance.created) },
            { label: "Updated", value: formatDateTime(instance.updated) },
            {
              label: "Host ID",
              value: instance.host_id ? <code>{instance.host_id}</code> : null,
            },
          ]}
        />
      </Panel>
      <Panel title="Specs">
        <KeyValueList
          items={[
            { label: "Flavour", value: flavor?.name },
            { label: "vCPUs", value: flavor?.vcpus },
            { label: "RAM", value: formatMb(flavor?.ram_mb) },
            { label: "Root disk", value: formatGb(flavor?.disk_gb) },
            { label: "Ephemeral disk", value: formatGb(flavor?.ephemeral_gb) },
            { label: "Service units", value: formatSuRate(flavor?.su_rate) },
            {
              label: "Image",
              value: instance.boot_from_volume ? (
                "Boot from volume"
              ) : instance.image ? (
                <AppLink
                  to="/compute/images/$imageId"
                  params={{ imageId: instance.image.id }}
                >
                  {instance.image.name ?? instance.image.id}
                </AppLink>
              ) : null,
            },
            { label: "Key pair", value: instance.key_name },
            {
              label: "Server groups",
              value:
                instance.server_group_ids.length > 0
                  ? instance.server_group_ids.map((groupId, index) => (
                      <Fragment key={groupId}>
                        {index > 0 && ", "}
                        <AppLink
                          to="/compute/server-groups/$groupId"
                          params={{ groupId }}
                        >
                          {groups.data?.items.find((g) => g.id === groupId)
                            ?.name ?? groupId}
                        </AppLink>
                      </Fragment>
                    ))
                  : null,
            },
          ]}
        />
      </Panel>
      <Panel title="Addresses">
        {instance.addresses.length === 0 ? (
          <p className={styles.muted}>No addresses yet.</p>
        ) : (
          <KeyValueList
            items={instance.addresses.map((address) => ({
              label: `${address.network}${address.type === "floating" ? " (floating)" : ""}`,
              value: <code>{address.addr}</code>,
            }))}
          />
        )}
      </Panel>
      <Panel title="Metadata">
        {Object.keys(instance.metadata).length === 0 ? (
          <p className={styles.muted}>No metadata is set.</p>
        ) : (
          <KeyValueList
            items={Object.entries(instance.metadata).map(([key, value]) => ({
              label: key,
              value,
            }))}
          />
        )}
      </Panel>
    </div>
  );
}
