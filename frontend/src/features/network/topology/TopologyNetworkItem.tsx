// One network of the topology list.
import { Globe, Network as NetworkIcon } from "lucide-react";
import { AppLink } from "../../../components/AppLink/AppLink";
import { StatusPill } from "../../../components/StatusPill/StatusPill";
import { statusLabel, statusTone } from "../status";
import { AttachmentIcon } from "./AttachmentIcon";
import type { TopologyAttachment, TopologyNetwork } from "./topology";
import styles from "./TopologyPage.module.scss";

/** What each kind of attachment is called after its name; instances need
 * no label, their glyph says it. */
const KIND_LABELS: Record<
  Exclude<TopologyAttachment["kind"], "instance">,
  string
> = {
  gateway: "router gateway",
  router: "router",
  port: "port",
};

/**
 * A network as a list item: its name and badges, its subnets, and what is
 * connected to it with each device's addresses and status; a router also
 * names the other networks it joins this one to.
 */
export function TopologyNetworkItem({ network }: { network: TopologyNetwork }) {
  return (
    <li className={styles.network}>
      <div className={styles.networkHead}>
        <h2 className={styles.networkName}>
          {network.isExternal ? (
            <Globe aria-hidden="true" className={styles.icon} />
          ) : (
            <NetworkIcon aria-hidden="true" className={styles.icon} />
          )}
          <AppLink
            to="/network/networks/$networkId"
            params={{ networkId: network.id }}
            search={{}}
          >
            {network.name}
          </AppLink>
        </h2>
        <div className={styles.badges}>
          {network.isExternal && <StatusPill tone="info">External</StatusPill>}
          {network.isShared && <StatusPill tone="neutral">Shared</StatusPill>}
          <StatusPill tone={statusTone(network.status)}>
            {statusLabel(network.status)}
          </StatusPill>
        </div>
      </div>
      {network.subnets.length > 0 && (
        <ul
          className={styles.subnets}
          aria-label={`Subnets of ${network.name}`}
        >
          {network.subnets.map((subnet) => (
            <li key={subnet.id} className={styles.subnet}>
              <AppLink
                size="xs"
                to="/network/subnets/$subnetId"
                params={{ subnetId: subnet.id }}
              >
                {subnet.name || subnet.cidr || subnet.id}
              </AppLink>
              {subnet.name && subnet.cidr && (
                <code className={styles.cidr}>{subnet.cidr}</code>
              )}
            </li>
          ))}
        </ul>
      )}
      {network.attachments.length === 0 ? (
        <p className={styles.note}>Nothing is connected.</p>
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
                  <AppLink to={attachment.href}>{attachment.name}</AppLink>
                ) : (
                  attachment.name
                )}
                {attachment.kind !== "instance" && (
                  <span className={styles.kind}>
                    {` (${KIND_LABELS[attachment.kind]})`}
                  </span>
                )}
                {attachment.addresses.length > 0 && (
                  <code className={styles.addresses}>
                    {attachment.addresses.join(", ")}
                  </code>
                )}
                {attachment.connects.length > 0 && (
                  <span className={styles.kind}>
                    {"connects to "}
                    {attachment.connects.map((other, index) => (
                      <span key={other.id}>
                        {index > 0 && ", "}
                        <AppLink
                          size="sm"
                          to="/network/networks/$networkId"
                          params={{ networkId: other.id }}
                          search={{}}
                        >
                          {other.name}
                        </AppLink>
                      </span>
                    ))}
                  </span>
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
  );
}
