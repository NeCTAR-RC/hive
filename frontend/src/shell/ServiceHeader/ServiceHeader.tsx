import type { ReactNode } from "react";
import {
  Button as AriaButton,
  Link as AriaLink,
  Menu,
  MenuItem,
  MenuTrigger,
  Popover,
  type Key,
  type PopoverProps,
} from "react-aria-components";
import { ChevronDown, ChevronRight } from "@ardc-ui/react";
import type { Me, PublicConfig } from "../../lib/api/types/session";
import { openHelpWidget } from "../../lib/help";
import { AppLink } from "../../components/AppLink/AppLink";
import { ListIcon } from "./icons";
import { ACCOUNT_LINKS, SERVICE_MENU, SUPPORT_LINKS } from "./menu-data";
import { useSignOut } from "./useSignOut";
import styles from "./ServiceHeader.module.scss";

/**
 * The dropdown sits 7px under its trigger: the spec's "Frame 1336" panel is
 * drawn at top 127px under the 120px header, whose bottom edge the trigger
 * shares.
 */
const MENU_OFFSET = 7;

const SITE_TITLE = "Nectar Dashboard";

/**
 * The service header from the design system's services-headers spec, with
 * the dashboard's function mirrored from Horizon's bar. From 1024px: the
 * Nectar logo and product name (one link home), the support links, the
 * services menu and the account menu. Below 1024px: the spec's Mobile bar,
 * the logo and name beside the button that opens the navigation dialog,
 * which then carries those links. The spec's band with the "Explore ARDC"
 * tab above the row is the agency mega menu, which index.html places above
 * the app; it carries the ARDC identity, so the logo here is Nectar's.
 * Without a session, the spec's call-to-action slot at the row's end offers
 * "Log in" where the account menu would be.
 */
export function ServiceHeader({
  me,
  signedOut = false,
  config,
  desktop,
  navOpen,
  onNavToggle,
}: {
  me: Me | undefined;
  /** No session: offer "Log in" in place of the account menu. */
  signedOut?: boolean;
  config: PublicConfig | undefined;
  /** Draw the desktop header; otherwise the mobile bar. */
  desktop: boolean;
  navOpen: boolean;
  onNavToggle: () => void;
}) {
  if (!desktop) {
    return (
      <header className={styles.mobileBar}>
        <Brand compact />
        <AriaButton
          className={styles.navButton}
          aria-label="Dashboard navigation"
          aria-haspopup="dialog"
          aria-expanded={navOpen}
          onPress={onNavToggle}
        >
          <ListIcon />
        </AriaButton>
      </header>
    );
  }

  return (
    <header className={styles.header}>
      <div className={styles.row}>
        <Brand />
        <nav aria-label="Support" className={styles.nav}>
          <ul className={styles.items}>
            <li>
              <AriaLink
                className={styles.item}
                href={config?.help_url ?? SUPPORT_LINKS.supportCentre}
              >
                Support Centre
              </AriaLink>
            </li>
            <li>
              <HeaderMenu label="Services">
                {SERVICE_MENU.map((link) => (
                  <HeaderMenuItem
                    key={link.href}
                    id={link.href}
                    href={link.href}
                  >
                    {link.label}
                  </HeaderMenuItem>
                ))}
              </HeaderMenu>
            </li>
            <li>
              <AriaLink className={styles.item} href={SUPPORT_LINKS.tutorials}>
                Tutorials
              </AriaLink>
            </li>
            <li>
              <AriaButton
                className={styles.item}
                onPress={() => openHelpWidget(config)}
              >
                Request help
              </AriaButton>
            </li>
          </ul>
        </nav>
        {me ? (
          <AccountMenu me={me} />
        ) : (
          signedOut && (
            <div className={styles.cta}>
              <AppLink
                href={ACCOUNT_LINKS.login}
                variant="primary"
                tone="navigation"
                size="sm"
              >
                Log in
              </AppLink>
            </div>
          )
        )}
      </div>
    </header>
  );
}

/**
 * The account menu, labelled with the signed-in user's name: their details,
 * the OpenStack RC file download and sign out.
 */
function AccountMenu({ me }: { me: Me }) {
  const signOut = useSignOut();
  const onAction = (key: Key) => {
    if (key === "logout") signOut();
  };
  return (
    <HeaderMenu label={me.user.name} placement="bottom end" onAction={onAction}>
      <HeaderMenuItem id="my-details" href={ACCOUNT_LINKS.myDetails}>
        My details
      </HeaderMenuItem>
      <HeaderMenuItem id="openrc" href={ACCOUNT_LINKS.openrc} download>
        OpenStack RC file
      </HeaderMenuItem>
      <HeaderMenuItem id="logout">Sign out</HeaderMenuItem>
    </HeaderMenu>
  );
}

/**
 * The Nectar logo and the product name as one link home ("Frame 1307" on
 * desktop, "Frame 1308" on the Mobile frame). The logo already reads "ARDC
 * Nectar Research Cloud", so the name beside it is the product's short one.
 */
function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <AriaLink
      href="/"
      className={styles.brand}
      data-compact={compact || undefined}
    >
      <img
        className={styles.logo}
        src="/logo.svg"
        alt="ARDC Nectar Research Cloud"
      />
      <span className={styles.title}>{SITE_TITLE}</span>
    </AriaLink>
  );
}

/**
 * A navigation item that opens a dropdown panel ("Nav Service Menu" with its
 * chevron, over "Frame 1336"). Built on React Aria's menu primitives because
 * the library `Menu` draws its rows to a different frame (12px padding,
 * purple text on hover, no trailing chevron).
 */
function HeaderMenu({
  label,
  placement = "bottom start",
  onAction,
  children,
}: {
  /** The trigger's label, which also names the menu. */
  label: ReactNode;
  placement?: PopoverProps["placement"];
  onAction?: (key: Key) => void;
  children: ReactNode;
}) {
  return (
    <MenuTrigger>
      <AriaButton className={styles.item}>
        <span className={styles.itemLabel}>{label}</span>
        <ChevronDown className={styles.itemChevron} />
      </AriaButton>
      <Popover
        className={styles.menu}
        placement={placement}
        offset={MENU_OFFSET}
      >
        <Menu className={styles.menuList} onAction={onAction}>
          {children}
        </Menu>
      </Popover>
    </MenuTrigger>
  );
}

/** One row of a header dropdown ("Mega Menu Nav Links"). */
function HeaderMenuItem({
  id,
  href,
  download,
  children,
}: {
  id: string;
  href?: string;
  download?: boolean;
  children: string;
}) {
  return (
    <MenuItem
      id={id}
      href={href}
      download={download}
      textValue={children}
      className={styles.menuRow}
    >
      {children}
      <span className={styles.menuChevron}>
        <ChevronRight />
      </span>
    </MenuItem>
  );
}
