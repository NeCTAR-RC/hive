// The glyph for what is plugged into a network.
import { Network as NetworkIcon, Router, Server } from "lucide-react";
import type { TopologyAttachment } from "./topology";
import styles from "./TopologyPage.module.scss";

/** The glyph for what is plugged into a network, at the shared icon size. */
export function AttachmentIcon({ kind }: { kind: TopologyAttachment["kind"] }) {
  switch (kind) {
    case "instance":
      return <Server aria-hidden="true" className={styles.icon} />;
    case "router":
    case "gateway":
      return <Router aria-hidden="true" className={styles.icon} />;
    default:
      return <NetworkIcon aria-hidden="true" className={styles.icon} />;
  }
}
