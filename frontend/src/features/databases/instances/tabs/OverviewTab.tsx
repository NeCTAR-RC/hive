// The Overview tab of a database instance (trove-dashboard instance detail
// overview, Nectar layout): details, specs, networking and a connection
// example.
import { Alert, Button } from "@ardc-ui/react";
import { AppLink } from "../../../../components/AppLink/AppLink";
import { CodeBlock } from "../../../../components/CodeBlock/CodeBlock";
import { KeyValueList } from "../../../../components/KeyValueList/KeyValueList";
import { Panel } from "../../../../components/Panel/Panel";
import { QuotaMeter } from "../../../../components/QuotaMeter/QuotaMeter";
import { StatusPill } from "../../../../components/StatusPill/StatusPill";
import type { DbInstanceDetail } from "../../../../lib/api/types/databases";
import {
  formatDateTime,
  formatMb,
  formatWithUnit,
} from "../../../../lib/format";
import {
  CONNECTION_EXAMPLES,
  datastoreLabel,
  statusLabel,
  statusTone,
} from "../../status";
import styles from "../../Databases.module.scss";

/**
 * The instance's fault and CIDR warnings, then its details, specs and
 * networking. The configuration group row attaches or detaches a group
 * through the page's instance actions, as far as the status allows.
 */
export function OverviewTab({
  instance,
  canAttach,
  canDetach,
  onAttach,
  onDetach,
}: {
  instance: DbInstanceDetail;
  canAttach: boolean;
  canDetach: boolean;
  onAttach: () => void;
  onDetach: () => void;
}) {
  const host = instance.hostname ?? instance.addresses[0] ?? "<host>";
  const example = CONNECTION_EXAMPLES[(instance.datastore ?? "").toLowerCase()];
  const configuration = instance.configuration;
  return (
    <div className={styles.stack}>
      {instance.fault?.message && (
        <Alert tone="danger" role="status">
          {instance.fault.message}
          {instance.fault.details ? ` ${instance.fault.details}` : ""}
        </Alert>
      )}
      {instance.cidr_warning && (
        <Alert tone="warning" role="status">
          {instance.cidr_warning}
        </Alert>
      )}
      <div className={styles.grid}>
        <Panel title="Details">
          <KeyValueList
            items={[
              {
                label: "Status",
                value: (
                  <StatusPill tone={statusTone(instance.status_kind)}>
                    {statusLabel(instance.status)}
                  </StatusPill>
                ),
              },
              { label: "Datastore", value: datastoreLabel(instance) },
              {
                label: "Configuration group",
                value: configuration ? (
                  <span>
                    <AppLink
                      to="/databases/configuration-groups/$configurationId"
                      params={{ configurationId: configuration.id }}
                    >
                      {("name" in configuration && configuration.name) ||
                        configuration.id}
                    </AppLink>{" "}
                    <Button
                      variant="link"
                      size="xs"
                      onPress={onDetach}
                      isDisabled={!canDetach}
                    >
                      Detach
                    </Button>
                  </span>
                ) : (
                  <span>
                    None{" "}
                    <Button
                      variant="link"
                      size="xs"
                      onPress={onAttach}
                      isDisabled={!canAttach}
                    >
                      Attach
                    </Button>
                  </span>
                ),
              },
              {
                label: "Availability zone",
                value: instance.availability_zone,
              },
              {
                label: "Created",
                value: formatDateTime(instance.created),
              },
              {
                label: "Updated",
                value: formatDateTime(instance.updated),
              },
              { label: "ID", value: <code>{instance.id}</code> },
            ]}
          />
        </Panel>
        <Panel title="Specs">
          <div className={styles.panelStack}>
            <KeyValueList
              items={[
                {
                  label: "Flavour",
                  value: instance.flavor_name ?? instance.flavor_id,
                },
                {
                  label: "RAM",
                  value: instance.ram ? formatMb(instance.ram) : null,
                },
                {
                  label: "Volume size",
                  value: formatWithUnit(instance.volume_size, "GB"),
                },
              ]}
            />
            {instance.volume_size !== null && instance.volume_used !== null && (
              <div className={styles.meters}>
                <QuotaMeter
                  label="Volume usage"
                  value={Math.round(instance.volume_used * 100) / 100}
                  max={instance.volume_size}
                  unit="GB used"
                />
              </div>
            )}
          </div>
        </Panel>
        <Panel title="Networking">
          <KeyValueList
            items={[
              {
                label: "Allowed CIDRs",
                value: instance.allowed_cidrs.join(", "),
              },
              {
                label: "Addresses",
                value: instance.addresses_detail
                  .map((a) => `${a.type ?? "address"}: ${a.address ?? ""}`)
                  .join(", "),
              },
              { label: "Host name", value: instance.hostname },
              { label: "Port", value: instance.port },
            ]}
          />
        </Panel>
        {example && (
          <Panel title="Connection">
            <CodeBlock text={example(host)} label="Connection example" wrap />
          </Panel>
        )}
      </div>
    </div>
  );
}
