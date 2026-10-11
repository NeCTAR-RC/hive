import styles from "./SkipLink.module.scss";

export function SkipLink() {
  return (
    <a className={styles.skip} href="#main">
      Skip to main content
    </a>
  );
}
