import { Dialog, Modal } from "@ardc-ui/react";
import type { Me, PublicConfig } from "../../lib/api/types/session";
import { openHelpWidget } from "../../lib/help";
import { LinkGroup, LinkGroups, LinkRow } from "../LinkRows/LinkRows";
import {
  ACCOUNT_LINKS,
  SERVICE_MENU,
  SUPPORT_LINKS,
} from "../ServiceHeader/menu-data";
import { useSignOut } from "../ServiceHeader/useSignOut";
import { SidebarContent } from "../Sidebar/Sidebar";

/**
 * The navigation below 1024px, in a library dialog opened from the mobile
 * header's button. It carries what the desktop header shows (support links,
 * services, the account, or "Log in" without a session) as related-link
 * rows, and below 768px, where the sidebar is not docked, the sidebar's
 * project block and navigation above them.
 */
export function NavigationDialog({
  me,
  signedOut = false,
  config,
  isOpen,
  onOpenChange,
  withSidebar,
}: {
  me: Me | undefined;
  /** No session: offer "Log in" in place of the account's rows. */
  signedOut?: boolean;
  config: PublicConfig | undefined;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  /** Include the sidebar's content (when it is not docked beside the page). */
  withSidebar: boolean;
}) {
  const signOut = useSignOut();
  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
      <Dialog title="Dashboard navigation" closeLabel="Close">
        {withSidebar && (
          <SidebarContent me={me} horizonUrl={config?.horizon_url} />
        )}
        <LinkGroups>
          <nav aria-label="Support">
            <LinkGroups>
              <LinkGroup>
                <LinkRow href={config?.help_url ?? SUPPORT_LINKS.supportCentre}>
                  Support Centre
                </LinkRow>
                <LinkRow href={SUPPORT_LINKS.tutorials}>Tutorials</LinkRow>
                <LinkRow
                  onPress={() => {
                    // The help widget opens over the page, not over this dialog.
                    onOpenChange(false);
                    openHelpWidget(config);
                  }}
                >
                  Request help
                </LinkRow>
              </LinkGroup>
              <LinkGroup heading="Services">
                {SERVICE_MENU.map((link) => (
                  <LinkRow key={link.href} href={link.href}>
                    {link.label}
                  </LinkRow>
                ))}
              </LinkGroup>
            </LinkGroups>
          </nav>
          {me ? (
            <LinkGroup heading={me.user.name}>
              <LinkRow href={ACCOUNT_LINKS.myDetails}>My details</LinkRow>
              <LinkRow href={ACCOUNT_LINKS.openrc} download>
                OpenStack RC file
              </LinkRow>
              <LinkRow onPress={signOut}>Sign out</LinkRow>
            </LinkGroup>
          ) : (
            signedOut && (
              <LinkGroup>
                <LinkRow href={ACCOUNT_LINKS.login}>Log in</LinkRow>
              </LinkGroup>
            )
          )}
        </LinkGroups>
      </Dialog>
    </Modal>
  );
}
