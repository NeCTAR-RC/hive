import { Link } from "@ardc-ui/react";
import { RouteLink } from "../../components/RouteLink/RouteLink";
import styles from "./ArdcFooter.module.scss";

// The dashboard's own pages route in the app; the rest leave it.
const QUICK_LINKS = [
  { label: "Nectar Support Centre", href: "https://support.ehelp.edu.au/" },
  {
    label: "Nectar System Status",
    href: "https://status.rc.nectar.org.au/",
  },
  { label: "Nectar Tutorials", href: "https://tutorials.rc.nectar.org.au/" },
  {
    label: "About Nectar",
    href: "https://ardc.edu.au/services/ardc-nectar-research-cloud/",
  },
  { label: "ARDC Website", href: "https://ardc.edu.au/" },
];

const LEGAL_LINKS = [
  {
    label: "Terms and Conditions",
    href: "https://ardc.edu.au/terms-and-conditions/",
  },
  { label: "Privacy Policy", href: "https://ardc.edu.au/privacy-policy/" },
  {
    label: "Accessibility Statement",
    href: "https://ardc.edu.au/accessibility-statement-for-ardc/",
  },
  {
    label: "ACN 633 798 857",
    href: "https://www.acnc.gov.au/charity/charities/eca273f3-f5be-e911-a98a-000d3ad02a61/profile",
  },
];

// Wording to be confirmed with ARDC communications before launch.
const ACKNOWLEDGEMENT =
  "The ARDC acknowledges the Traditional Owners and Custodians of the " +
  "lands on which we work, and pays respect to Elders past and present.";

const NCRIS =
  "The ARDC is funded through the National Collaborative Research " +
  "Infrastructure Strategy (NCRIS) to support national digital research " +
  "infrastructure for Australian researchers.";

/**
 * The ARDC footer, built locally from the Figma footer spec. Links are the
 * design system's, in their on-dark treatment.
 */
export function ArdcFooter() {
  return (
    <footer className={styles.footer}>
      <div className={styles.container}>
        <div className={styles.brand}>
          <img
            src="/ncris-provider.svg"
            alt="NCRIS, National Research Infrastructure for Australia"
            className={styles.ncris}
          />
          <img src="/ardc-logo.svg" alt="ARDC" className={styles.ardc} />
          <p className={styles.ncrisText}>{NCRIS}</p>
        </div>
        <nav aria-label="Quick links" className={styles.quick}>
          <h2 className={styles.heading}>Quick links</h2>
          <ul>
            <li>
              <RouteLink to="/" size="sm" onDark>
                Nectar Dashboard Home
              </RouteLink>
            </li>
            <li>
              <RouteLink to="/terms" size="sm" onDark>
                Terms of Service
              </RouteLink>
            </li>
            {QUICK_LINKS.map((link) => (
              <li key={link.href}>
                <Link href={link.href} size="sm" onDark>
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
      <div className={styles.container}>
        <p className={styles.acknowledgement}>{ACKNOWLEDGEMENT}</p>
      </div>
      <div className={styles.legalBand}>
        <div className={styles.container}>
          <ul className={styles.legal}>
            {LEGAL_LINKS.map((link) => (
              <li key={link.href}>
                <Link href={link.href} size="sm" onDark>
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </footer>
  );
}
