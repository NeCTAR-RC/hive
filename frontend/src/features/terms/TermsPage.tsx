import { useQuery } from "@tanstack/react-query";
import { ExternalLink } from "../../components/ExternalLink/ExternalLink";
import { configQuery } from "../../lib/queries";
import { useDocumentTitle } from "../../lib/useDocumentTitle";
import styles from "./TermsPage.module.scss";

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
    <div className={styles.page}>
      <h1>Terms of service</h1>
      <p>
        Use of the ARDC Nectar Research Cloud is subject to the ARDC{" "}
        <ExternalLink href="https://ardc.edu.au/terms-and-conditions/">
          terms and conditions
        </ExternalLink>{" "}
        and the Nectar Research Cloud service schedule.
      </p>
      <p>
        <ExternalLink href={`${horizon}/terms/`}>
          Read the full service schedule
        </ExternalLink>
        .
      </p>
    </div>
  );
}
