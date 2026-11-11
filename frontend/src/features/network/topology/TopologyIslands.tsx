// The devices of the topology that no network connects.
import { AppLink } from "../../../components/AppLink/AppLink";
import { StatusPill } from "../../../components/StatusPill/StatusPill";
import { statusLabel, statusTone } from "../status";
import { AttachmentIcon } from "./AttachmentIcon";
import type { TopologyIsland } from "./topology";
import styles from "./TopologyPage.module.scss";

/** The "Not connected to a network" section, with each device's status. */
export function TopologyIslands({ islands }: { islands: TopologyIsland[] }) {
  return (
    <section className={styles.islands} aria-labelledby="topology-unconnected">
      <h2 id="topology-unconnected" className={styles.islandsTitle}>
        Not connected to a network
      </h2>
      <ul className={styles.attachments}>
        {islands.map((island) => (
          <li key={`${island.kind}:${island.id}`} className={styles.attachment}>
            <AttachmentIcon kind={island.kind} />
            <span className={styles.attachmentBody}>
              <AppLink to={island.href}>{island.name}</AppLink>
              {island.kind === "router" && (
                <span className={styles.kind}> (router)</span>
              )}
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
  );
}
