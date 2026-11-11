import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { meQuery } from "../../../lib/queries";
import { PageHeader } from "../../../shell/PageHeader/PageHeader";

/**
 * Shows the user lookup pages only to a user with the `user_lookup`
 * capability, the one the sidebar reads to show "User details"
 * (`shell/navigation/panels.ts`). Anyone else who opens the address hears
 * why instead of a search the backend would refuse, and no lookup request
 * is sent, because the page beneath is never rendered.
 */
export function UserLookupGate({ children }: { children: ReactNode }) {
  const { data: me } = useQuery(meQuery);
  // The dashboard layout loads /api/me before any page renders.
  if (me && !me.capabilities.user_lookup) {
    return (
      <>
        <PageHeader title="User details" crumbs={[{ label: "Identity" }]} />
        <p>You do not have access to user lookup.</p>
      </>
    );
  }
  return children;
}
