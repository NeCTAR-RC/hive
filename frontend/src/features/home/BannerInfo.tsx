// The featured banner's fine print.
import { Fragment } from "react";
import { AppLink } from "../../components/AppLink/AppLink";
import { parseBannerInfo } from "./banner";
import styles from "./HomePage.module.scss";

/** The banner's fine print, with any links in it as library links. */
export function BannerInfo({ html }: { html: string }) {
  return (
    <p className={styles.bannerInfo}>
      {parseBannerInfo(html).map((part, index) =>
        part.href ? (
          <AppLink key={index} href={part.href} newTab size="xs">
            {part.text}
          </AppLink>
        ) : (
          <Fragment key={index}>{part.text}</Fragment>
        ),
      )}
    </p>
  );
}
