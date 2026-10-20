import { useEffect, useState } from "react";
// JSX types for the custom elements.
import type {} from "./ardc-elements";
import { loadArdcComponent } from "./loader";
import styles from "./ArdcComponents.module.scss";

/**
 * The ARDC website mega menu, as langstroth's header_nav.html embeds it. It
 * starts transparent (the component reveals itself once rendered) and is
 * hidden altogether if its loader fails, dropping the reserved space.
 */
export function ArdcMegamenu() {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    loadArdcComponent("megamenu").catch(() => setFailed(true));
  }, []);

  return (
    <div className={styles.megamenuBand}>
      <ardc-megamenu
        className={styles.megamenu}
        data-host="ARDC Main Website"
        data-content-width="wide"
        hidden={failed}
        style={{ opacity: 0 }}
      />
    </div>
  );
}
