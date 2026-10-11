// The Network Topology panel as a list: every network with its subnets
// and what is plugged into it, external networks first, then anything
// not connected to a network. Horizon draws a graph; a list reads on a
// phone and with a screen reader and needs no canvas.
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link as RouterLink } from "@tanstack/react-router";
import { Button } from "@ardc-ui/react";
import { Globe, Network as NetworkIcon, Router, Server } from "lucide-react";
import { EmptyState } from "../../../components/EmptyState/EmptyState";
import { ErrorState } from "../../../components/ErrorState/ErrorState";
import { SkeletonLines } from "../../../components/Skeleton/Skeleton";
import { StatusPill } from "../../../components/StatusPill/StatusPill";
import { useProjectId } from "../../../lib/useProject";
import { PageHeader } from "../../../shell/PageHeader/PageHeader";
import { statusLabel, statusTone } from "../status";
import { topologyQuery } from "../api";
import { buildTopology, type TopologyAttachment } from "./topology";
import styles from "./TopologyPage.module.scss";

const CRUMBS = [{ label: "Project" }, { label: "Network" }];

function AttachmentIcon({ kind }: { kind: TopologyAttachment["kind"] }) {
  const size = 16;
  switch (kind) {
    case "instance":
      return <Server aria-hidden="true" size={size} />;
    case "router":
    case "gateway":
      return <Router aria-hidden="true" size={size} />;
    default:
      return <NetworkIcon aria-hidden="true" size={size} />;
  }
}

export function TopologyPage() {
  const projectId = useProjectId();
  const topology = useQuery(topologyQuery(projectId));
  const built = useMemo(
    () => (topology.data ? buildTopology(topology.data) : null),
    [topology.data],
  );

  return (
    <>
      <PageHeader
        title="Network Topology"
        crumbs={CRUMBS}
        actions={
          <Button
            variant="secondary"
            size="sm"
            onPress={() => void topology.refetch()}
            isDisabled={topology.isFetching}
          >
            Refresh
          </Button>
        }
      />
      {topology.isError ? (
        <ErrorState
          error={topology.error}
          onRetry={() => void topology.refetch()}
        />
      ) : !built ? (
        <SkeletonLines lines={10} />
      ) : built.networks.length === 0 ? (
        <EmptyState title="No networks">
          <p>
            Create a network, or launch an instance, and it appears here with
            everything connected to it.
          </p>
        </EmptyState>
      ) : (
        <div className={styles.layout}>
          <ul className={styles.networks} aria-label="Networks">
            {built.networks.map((network) => (
              <li key={network.id} className={styles.network}>
                <div className={styles.networkHead}>
                  <h2 className={styles.networkName}>
                    {network.isExternal ? (
                      <Globe aria-hidden="true" size={18} />
                    ) : (
                      <NetworkIcon aria-hidden="true" size={18} />
                    )}
                    <RouterLink
                      to="/network/networks/$networkId"
                      params={{ networkId: network.id }}
                      search={{}}
                    >
                      {network.name}
                    </RouterLink>
                  </h2>
                  <div className={styles.badges}>
                    {network.isExternal && (
                      <StatusPill tone="info">External</StatusPill>
                    )}
                    {network.isShared && (
                      <StatusPill tone="neutral">Shared</StatusPill>
                    )}
                    <StatusPill tone={statusTone(network.status)}>
                      {statusLabel(network.status)}
                    </StatusPill>
                  </div>
                </div>
                {network.subnets.length > 0 && (
                  <p className={styles.subnets}>
                    {network.subnets.map((subnet, index) => (
                      <span key={subnet.id}>
                        {index > 0 && ", "}
                        <RouterLink
                          to="/network/subnets/$subnetId"
                          params={{ subnetId: subnet.id }}
                        >
                          {subnet.name ? `${subnet.name} ` : ""}
                          <code>{subnet.cidr}</code>
                        </RouterLink>
                      </span>
                    ))}
                  </p>
                )}
                {network.attachments.length === 0 ? (
                  <p className={styles.muted}>Nothing is connected.</p>
                ) : (
                  <ul
                    className={styles.attachments}
                    aria-label={`Connected to ${network.name}`}
                  >
                    {network.attachments.map((attachment) => (
                      <li
                        key={`${attachment.kind}:${attachment.id}`}
                        className={styles.attachment}
                      >
                        <AttachmentIcon kind={attachment.kind} />
                        <span className={styles.attachmentBody}>
                          {attachment.href ? (
                            <RouterLink to={attachment.href}>
                              {attachment.name}
                            </RouterLink>
                          ) : (
                            attachment.name
                          )}
                          <span className={styles.kind}>
                            {attachment.kind === "gateway"
                              ? " (router gateway)"
                              : attachment.kind === "router"
                                ? " (router)"
                                : attachment.kind === "port"
                                  ? " (port)"
                                  : ""}
                          </span>
                          {attachment.addresses.length > 0 && (
                            <code className={styles.addresses}>
                              {attachment.addresses.join(", ")}
                            </code>
                          )}
                        </span>
                        {attachment.status && (
                          <StatusPill tone={statusTone(attachment.status)}>
                            {statusLabel(attachment.status)}
                          </StatusPill>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
          {built.islands.length > 0 && (
            <section
              className={styles.islands}
              aria-labelledby="topology-unconnected"
            >
              <h2 id="topology-unconnected" className={styles.islandsTitle}>
                Not connected to a network
              </h2>
              <ul className={styles.attachments}>
                {built.islands.map((island) => (
                  <li
                    key={`${island.kind}:${island.id}`}
                    className={styles.attachment}
                  >
                    <AttachmentIcon kind={island.kind} />
                    <span className={styles.attachmentBody}>
                      <RouterLink to={island.href}>{island.name}</RouterLink>
                      <span className={styles.kind}>
                        {island.kind === "router" ? " (router)" : ""}
                      </span>
                    </span>
                    {island.status && (
                      <StatusPill tone={statusTone(island.status)}>
                        {statusLabel(island.status)}
                      </StatusPill>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </>
  );
}
