import { useNavigate } from "@tanstack/react-router";
import {
  Button,
  ChevronDown,
  Close,
  Link,
  Menu,
  MenuItem,
  MenuTrigger,
} from "@ardc-ui/react";
import type { Key } from "@ardc-ui/react";
import { Link as AriaLink } from "react-aria-components";
import { Menu as MenuIcon } from "lucide-react";
import type { Me, PublicConfig } from "../../lib/api/types";
import { openHelpWidget } from "../../lib/help";
import { useLogout } from "../../lib/queries";
import { notify } from "../../lib/notify";
import { SUPPORT_LINKS } from "../links";
import { ServicesMenu } from "../ServicesMenu/ServicesMenu";
import styles from "./DashboardBar.module.scss";

/**
 * The dashboard's own bar: Nectar logo, support links and the user menu.
 * On narrow screens it also carries the toggle for the navigation drawer.
 */
export function DashboardBar({
  me,
  config,
  navOpen,
  onNavToggle,
  showNavToggle,
}: {
  me: Me | undefined;
  config: PublicConfig | undefined;
  navOpen: boolean;
  onNavToggle: () => void;
  showNavToggle: boolean;
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
    <div className={styles.bar}>
      <div className={styles.left}>
        {showNavToggle && (
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
        {/* A bare image link: the DS Link would draw its state line under
            the logo. It still routes in the app through the RouterProvider. */}
        <AriaLink href="/" className={styles.logo}>
          <img src="/logo.svg" alt={config?.site_name ?? "Nectar Dashboard"} />
        </AriaLink>
      </div>
      <nav aria-label="Support" className={styles.support}>
        <ul>
          <li>
            <Link
              size="sm"
              href={config?.help_url ?? SUPPORT_LINKS.supportCentre}
            >
              Support Centre
            </Link>
          </li>
          <li>
            <ServicesMenu label="Services" />
          </li>
          <li>
            <Link size="sm" href={SUPPORT_LINKS.tutorials}>
              Tutorials
            </Link>
          </li>
          <li>
            <Button
              variant="link"
              size="sm"
              onPress={() => openHelpWidget(config)}
            >
              Request Help
            </Button>
          </li>
        </ul>
      </nav>
      {me && (
        <MenuTrigger>
          <Button variant="link" size="sm" className={styles.user}>
            <span className={styles.userName}>{me.user.name}</span>
            <ChevronDown aria-hidden="true" />
          </Button>
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
      )}
    </div>
  );
}
