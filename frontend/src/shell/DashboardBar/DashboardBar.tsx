import { useNavigate } from "@tanstack/react-router";
import { Button, Menu, MenuItem, MenuTrigger } from "@ardc-ui/react";
import { Link as AriaLink } from "react-aria-components";
import { Menu as MenuIcon, X } from "lucide-react";
import { ChevronDown } from "@ardc-ui/react";
import type { Me, PublicConfig } from "../../lib/api/types";
import { openHelpWidget } from "../../lib/help";
import { useLogout } from "../../lib/queries";
import { notify } from "../../lib/notify";
import { SERVICE_MENU, SUPPORT_LINKS } from "../ArdcHeader/menu-data";
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

  const onUserAction = (key: React.Key) => {
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
          <button
            type="button"
            className={styles.navToggle}
            aria-expanded={navOpen}
            aria-controls="hive-sidebar"
            onClick={onNavToggle}
          >
            {navOpen ? (
              <X aria-hidden="true" size={22} />
            ) : (
              <MenuIcon aria-hidden="true" size={22} />
            )}
            <span className="visually-hidden">Dashboard navigation</span>
          </button>
        )}
        <AriaLink href="/" className={styles.logo}>
          <img src="/logo.svg" alt={config?.site_name ?? "Nectar Dashboard"} />
        </AriaLink>
      </div>
      <nav aria-label="Support" className={styles.support}>
        <ul>
          <li>
            <a href={config?.help_url ?? SUPPORT_LINKS.supportCentre}>
              Support Centre
            </a>
          </li>
          <li>
            <MenuTrigger>
              <Button variant="link" size="sm">
                Services
                <ChevronDown aria-hidden="true" />
              </Button>
              <Menu aria-label="Nectar services">
                {SERVICE_MENU.map((link) => (
                  <MenuItem key={link.href} id={link.href} href={link.href}>
                    {link.label}
                  </MenuItem>
                ))}
              </Menu>
            </MenuTrigger>
          </li>
          <li>
            <a href={SUPPORT_LINKS.tutorials}>Tutorials</a>
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
