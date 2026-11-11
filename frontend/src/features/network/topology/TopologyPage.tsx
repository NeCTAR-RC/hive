// The Network Topology panel as a list: every network with its subnets
// and what is plugged into it, external networks first, then anything
// not connected to a network. Horizon draws a graph; a list reads on a
// phone and with a screen reader and needs no canvas.
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@ardc-ui/react";
import { AppLink } from "../../../components/AppLink/AppLink";
import { EmptyState } from "../../../components/EmptyState/EmptyState";
import { ErrorState } from "../../../components/ErrorState/ErrorState";
import { SkeletonLines } from "../../../components/Skeleton/Skeleton";
import { useProjectId } from "../../../lib/hooks/useProjectId";
import { PageHeader } from "../../../shell/PageHeader/PageHeader";
import { topologyQuery } from "../api";
import { buildTopology } from "./topology";
import { TopologyIslands } from "./TopologyIslands";
import { TopologyNetworkItem } from "./TopologyNetworkItem";
import styles from "./TopologyPage.module.scss";

const CRUMBS = [{ label: "Project" }, { label: "Network" }];

/**
 * The topology page: the network list once it loads, with Horizon's three
 * create actions (launch an instance, create a network, create a router)
 * and Refresh in the header, and the unconnected devices after it.
 */
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
        title="Network topology"
        crumbs={CRUMBS}
        actions={
          <>
            <AppLink
              variant="primary"
              size="sm"
              to="/compute/instances/launch"
              search={{}}
            >
              Launch instance
            </AppLink>
            <AppLink
              variant="secondary"
              size="sm"
              to="/network/networks"
              search={{ create: true }}
            >
              Create network
            </AppLink>
            <AppLink
              variant="secondary"
              size="sm"
              to="/network/routers"
              search={{ create: true }}
            >
              Create router
            </AppLink>
            <Button
              variant="secondary"
              size="sm"
              onPress={() => void topology.refetch()}
              isDisabled={topology.isFetching}
            >
              Refresh
            </Button>
          </>
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
              <TopologyNetworkItem key={network.id} network={network} />
            ))}
          </ul>
          {built.islands.length > 0 && (
            <TopologyIslands islands={built.islands} />
          )}
        </div>
      )}
    </>
  );
}
