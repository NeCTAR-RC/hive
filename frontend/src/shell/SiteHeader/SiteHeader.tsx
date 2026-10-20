import { useNavigate } from "@tanstack/react-router";
import {
  Button,
  ChevronDown,
  Close,
  Menu,
  MenuItem,
  MenuTrigger,
} from "@ardc-ui/react";
import type { Key } from "@ardc-ui/react";
import { Button as AriaButton, Link as AriaLink } from "react-aria-components";
import { Menu as MenuIcon } from "lucide-react";
import type { Me, PublicConfig } from "../../lib/api/types";
import { openHelpWidget } from "../../lib/help";
import { useLogout } from "../../lib/queries";
import { notify } from "../../lib/notify";
import { SERVICE_MENU, SUPPORT_LINKS } from "../links";
import styles from "./SiteHeader.module.scss";

const ARDC_HOME = "https://ardc.edu.au/";

/**
 * The site header, after the "Temporary Header" template of the ARDC UI
 * React design system (the stand-in until the DS ships a header component):
 * the Nectar logo (the template's custom logo) and product name, the
 * support links, the account menu (or a login button without a session) and
 * the Explore ARDC tab. On narrow screens the links fold away and a toggle
 * opens the navigation drawer.
 */
export function SiteHeader({
  me,
  config,
  navOpen = false,
  onNavToggle,
  showLogin = false,
}: {
  me?: Me;
  config: PublicConfig | undefined;
  navOpen?: boolean;
  /** Shows the navigation drawer toggle (narrow screens only). */
  onNavToggle?: () => void;
  /** Shows the login button when there is no user. */
  showLogin?: boolean;
}) {
  const navigate = useNavigate();
  const logout = useLogout();

  const onUserAction = (key: Key) => {
    if (key === "logout") {
      logout.mutate(undefined, {
        onSuccess: () => void navigate({ to: "/auth/signed-out" }),
        onError: () => notify.danger("Sign out failed. Please try again."),
      });
    } else if (key === "help") {
      openHelpWidget(config);
    }
  };

  return (
    <header className={styles.header}>
      <div className={styles.band} />
      <div className={styles.container}>
        <a href={ARDC_HOME} className={styles.explore}>
          <span className={styles.exploreLabel}>Explore ARDC</span>
          <span className={styles.squares} aria-hidden="true">
            <span />
            <span />
            <span />
            <span />
          </span>
        </a>
        <div className={styles.row}>
          {/* A bare link: the DS Link would draw its state line under the
              logo. It still routes in the app through the RouterProvider. */}
          <AriaLink href="/" className={styles.brand}>
            <img src="/logo.svg" alt="ARDC Nectar Research Cloud" />
            <span className={styles.product}>
              {config?.site_name ?? "Nectar Dashboard"}
            </span>
          </AriaLink>
          <nav aria-label="Support" className={styles.nav}>
            <ul>
              <li>
                <a
                  className={styles.item}
                  href={config?.help_url ?? SUPPORT_LINKS.supportCentre}
                >
                  Support Centre
                </a>
              </li>
              <li>
                <MenuTrigger>
                  <AriaButton className={styles.item}>
                    Services
                    <ChevronDown aria-hidden="true" />
                  </AriaButton>
                  <Menu aria-label="Nectar services" placement="bottom">
                    {SERVICE_MENU.map((link) => (
                      <MenuItem key={link.href} id={link.href} href={link.href}>
                        {link.label}
                      </MenuItem>
                    ))}
                  </Menu>
                </MenuTrigger>
              </li>
              <li>
                <a className={styles.item} href={SUPPORT_LINKS.tutorials}>
                  Tutorials
                </a>
              </li>
              <li>
                <AriaButton
                  className={styles.item}
                  onPress={() => openHelpWidget(config)}
                >
                  Request Help
                </AriaButton>
              </li>
            </ul>
          </nav>
          {me ? (
            <MenuTrigger>
              <AriaButton className={`${styles.item} ${styles.user}`}>
                <span className={styles.userName}>{me.user.name}</span>
                <ChevronDown aria-hidden="true" />
              </AriaButton>
              <Menu
                aria-label="Account"
                onAction={onUserAction}
                placement="bottom end"
              >
                <MenuItem id="my-details" href="/account/my-details">
                  My Details
                </MenuItem>
                <MenuItem id="openrc" href="/api/api-access/openrc" download>
                  OpenStack RC File
                </MenuItem>
                <MenuItem id="help" className={styles.compactOnly}>
                  Request Help
                </MenuItem>
                <MenuItem id="logout">Sign Out</MenuItem>
              </Menu>
            </MenuTrigger>
          ) : (
            showLogin && (
              <div className={styles.login}>
                <Button
                  tone="navigation"
                  onPress={() => void navigate({ to: "/auth/login" })}
                >
                  Log In
                </Button>
              </div>
            )
          )}
          {onNavToggle && (
            <Button
              variant="link"
              className={styles.navToggle}
              aria-label="Dashboard navigation"
              aria-expanded={navOpen}
              aria-controls="hive-sidebar"
              onPress={onNavToggle}
            >
              {navOpen ? (
                <Close aria-hidden="true" size="1.375rem" />
              ) : (
                <MenuIcon aria-hidden="true" size={22} />
              )}
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
