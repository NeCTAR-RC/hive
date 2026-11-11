import { useQuery } from "@tanstack/react-query";
import { configQuery } from "../../lib/queries";
import { useDocumentTitle } from "../../lib/hooks/useDocumentTitle";
import { AppLink } from "../../components/AppLink/AppLink";
import styles from "../TextPage.module.scss";

/**
 * Terms of service. The Service Schedule text lives in Horizon's static
 * terms page today; until it is ported here verbatim, this page points to
 * the authoritative copies.
 */
export function TermsPage() {
  useDocumentTitle("Terms of service");
  const { data: config } = useQuery(configQuery);
  const horizon = config?.horizon_url?.replace(/\/$/, "") ?? "";
  return (
    <div className={styles.band}>
      <div className={styles.text}>
        <div className={styles.intro}>
          <h1>Terms of service</h1>
          <p>
            Use of the ARDC Nectar Research Cloud is subject to the ARDC{" "}
            <AppLink href="https://ardc.edu.au/terms-and-conditions/" newTab>
              terms and conditions
            </AppLink>{" "}
            and the Nectar Research Cloud service schedule.
          </p>
          <p>
            <AppLink href={`${horizon}/terms/`}>
              Read the full service schedule
            </AppLink>
            .
          </p>
        </div>
      </div>
    </div>
  );
}
