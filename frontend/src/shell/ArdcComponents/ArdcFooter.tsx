import { useEffect } from "react";
// JSX types for the custom elements.
import type {} from "./ardc-elements";
import { loadArdcComponent } from "./loader";
import styles from "./ArdcComponents.module.scss";

// The component renders these lists as its quick links and legal links.
const QUICK_LINKS = [
  { label: "Nectar Dashboard Home", href: "/", title: "Go to the dashboard" },
  {
    label: "Terms of Service",
    href: "/terms",
    title: "Read the Nectar Cloud Terms and Conditions",
  },
  {
    label: "Nectar Support",
    href: "https://support.ehelp.edu.au/",
    title: "Visit the Nectar Support Centre",
  },
  {
    label: "Nectar System Status",
    href: "https://status.rc.nectar.org.au/",
    title: "Check the Nectar Cloud status",
  },
  {
    label: "Nectar Tutorials",
    href: "https://tutorials.rc.nectar.org.au/",
    title: "Learn with Nectar Cloud Tutorials",
  },
  {
    label: "About Nectar",
    href: "https://ardc.edu.au/services/ardc-nectar-research-cloud/",
    title: "Learn About the ARDC Nectar Research Cloud",
  },
  {
    label: "ARDC Website",
    href: "https://ardc.edu.au/",
    title: "Explore the ARDC Website",
  },
];

const LEGAL_LINKS = [
  {
    label: "Terms & Conditions",
    href: "https://ardc.edu.au/terms-and-conditions/",
  },
  { label: "Privacy Policy", href: "https://ardc.edu.au/privacy-policy/" },
  {
    label: "Accessibility Statement",
    href: "https://ardc.edu.au/accessibility-statement-for-ardc/",
  },
];

const ACNC_PROFILE =
  "https://www.acnc.gov.au/charity/charities/eca273f3-f5be-e911-a98a-000d3ad02a61/profile";

/**
 * The ARDC website footer, as langstroth's footer.html embeds it. Plain
 * anchors, not app links: the component takes over these lists.
 */
export function ArdcFooter() {
  useEffect(() => {
    // Without the loader the lists below stay as a plain fallback.
    loadArdcComponent("footer").catch(() => {});
  }, []);

  return (
    <ardc-footer
      className={`ardc-footer ardc-custom-component ${styles.footer}`}
      data-content-width="wide"
      data-show-ardc-logo=""
      style={{ opacity: 0 }}
    >
      <ul id="quick-links">
        {QUICK_LINKS.map((link) => (
          <li key={link.href}>
            <a href={link.href} title={link.title}>
              {link.label}
            </a>
          </li>
        ))}
      </ul>
      <ul id="legal-links">
        {LEGAL_LINKS.map((link) => (
          <li key={link.href}>
            <a href={link.href}>{link.label}</a>
          </li>
        ))}
      </ul>
      <a href={ACNC_PROFILE} id="ardc-footer-acn">
        ACN 633 798 857
      </a>
    </ardc-footer>
  );
}
