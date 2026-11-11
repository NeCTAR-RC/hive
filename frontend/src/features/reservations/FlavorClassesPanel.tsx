// The create page's notes on the reservable flavour classes.
import { Alert, Badge, TabItem, Tabs } from "@ardc-ui/react";
import { Panel } from "../../components/Panel/Panel";
import styles from "./CreateReservationPage.module.scss";
import { FLAVOR_CLASSES } from "./data/flavorClasses";

function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

/**
 * The flavour classes one tab each, then the note that GPU flavours are not
 * for Auckland users and the reminder that reservation days run in UTC,
 * naming the browser's own time zone.
 */
export function FlavorClassesPanel() {
  return (
    <Panel title="Available flavour classes">
      <div className={styles.panelBody}>
        <Tabs aria-label="Flavour classes" collapseBelow={false}>
          {FLAVOR_CLASSES.map((item) => (
            <TabItem key={item.id} id={item.id} title={item.title}>
              <div className={styles.classBody}>
                <h3 className={styles.classHeading}>{item.heading}</h3>
                <p className={styles.classText}>{item.text}</p>
              </div>
            </TabItem>
          ))}
        </Tabs>
        <p className={styles.note}>
          <Badge>Note</Badge>{" "}
          <strong>GPU flavours are not available to Auckland users.</strong>
        </p>
        <Alert tone="info">
          Reservation days run in UTC. Your browser&apos;s time zone is{" "}
          <strong>{browserTimeZone()}</strong>.
        </Alert>
      </div>
    </Panel>
  );
}
