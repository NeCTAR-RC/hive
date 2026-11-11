// The home page's list of Nectar service announcements.
import { useQuery } from "@tanstack/react-query";
import { AppLink } from "../../components/AppLink/AppLink";
import { Panel } from "../../components/Panel/Panel";
import { SkeletonLines } from "../../components/Skeleton/Skeleton";
import { outagesQuery } from "../../lib/queries";
import { SUPPORT_LINKS } from "../../shell/ServiceHeader/menu-data";
import styles from "./HomePage.module.scss";
import { LinkRow } from "./LinkRow";
import { outageMeta } from "./outages";

/**
 * Every outage in the status feed as a link row under its schedule, status
 * and start date, with the way to the system status page. The panel is left
 * out once the feed has loaded empty.
 */
export function Announcements() {
  const { data, isPending } = useQuery(outagesQuery);
  const items = data?.items ?? [];
  if (!isPending && items.length === 0) return null;
  return (
    <Panel
      title="Service announcements"
      className={styles.announcements}
      actions={
        <AppLink href={SUPPORT_LINKS.status} newTab size="sm">
          Nectar system status
        </AppLink>
      }
    >
      {isPending ? (
        <SkeletonLines />
      ) : (
        <ul className={styles.list}>
          {items.map((outage) => (
            <LinkRow key={outage.id} meta={outageMeta(outage)}>
              <AppLink href={outage.url} newTab>
                {outage.title}
              </AppLink>
            </LinkRow>
          ))}
        </ul>
      )}
    </Panel>
  );
}
