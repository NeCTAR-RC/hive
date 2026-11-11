/**
 * The agency footer: ARDC's `<ardc-footer>` web component, which the footer
 * loader in index.html hydrates from ardc.edu.au. The lists inside are the
 * content it renders: Hive's quick links, the legal links and the ACN.
 *
 * Rendered by the layouts at the end of their scrolling column, as Horizon
 * puts its footer inside the content column. A custom element upgrades
 * whenever it is connected, so an element mounted after the loader ran
 * hydrates as one present at page load does. On hydration the component
 * moves the lists into its shadow root and removes them here; the markup is
 * static, so React never touches those children again.
 */
export function ArdcFooter() {
  return (
    <ardc-footer
      className="ardc-footer ardc-custom-component"
      data-content-width="normal"
      data-show-ardc-logo=""
      style={{ opacity: 0 }}
    >
      <ul id="quick-links">
        <li>
          <a href="/">Nectar Dashboard Home</a>
        </li>
        <li>
          <a href="/terms">Terms of Service</a>
        </li>
        <li>
          <ExternalLink href="https://support.ehelp.edu.au/">
            Nectar Support Centre
          </ExternalLink>
        </li>
        <li>
          <ExternalLink href="https://status.rc.nectar.org.au/">
            Nectar System Status
          </ExternalLink>
        </li>
        <li>
          <ExternalLink href="https://tutorials.rc.nectar.org.au/">
            Nectar Tutorials
          </ExternalLink>
        </li>
        <li>
          <ExternalLink href="https://ardc.edu.au/services/ardc-nectar-research-cloud/">
            About Nectar
          </ExternalLink>
        </li>
        <li>
          <ExternalLink href="https://ardc.edu.au/">ARDC Website</ExternalLink>
        </li>
      </ul>
      <ul id="legal-links">
        <li>
          <ExternalLink href="https://ardc.edu.au/terms-and-conditions/">
            Terms and Conditions
          </ExternalLink>
        </li>
        <li>
          <ExternalLink href="https://ardc.edu.au/privacy-policy/">
            Privacy Policy
          </ExternalLink>
        </li>
        <li>
          <ExternalLink href="https://ardc.edu.au/accessibility-statement-for-ardc/">
            Accessibility Statement
          </ExternalLink>
        </li>
      </ul>
      <ExternalLink
        id="ardc-footer-acn"
        href="https://www.acnc.gov.au/charity/charities/eca273f3-f5be-e911-a98a-000d3ad02a61/profile"
      >
        ACN 633 798 857
      </ExternalLink>
    </ardc-footer>
  );
}

/**
 * A raw anchor that opens in a new tab: the footer copies each anchor's
 * attributes into its own markup, so these must be plain elements.
 */
function ExternalLink({
  id,
  href,
  children,
}: {
  id?: string;
  href: string;
  children: string;
}) {
  return (
    <a id={id} href={href} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  );
}
