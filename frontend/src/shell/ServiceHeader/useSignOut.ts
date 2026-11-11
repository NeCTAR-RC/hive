import { useNavigate } from "@tanstack/react-router";
import { useLogout } from "../../lib/queries";
import { notify } from "../../lib/notify";

/**
 * Signs the user out and lands on the signed-out page; a failure is
 * announced and leaves the session as it was. Shared by the header's account
 * menu and the navigation dialog.
 */
export function useSignOut(): () => void {
  const navigate = useNavigate();
  const logout = useLogout();
  return () =>
    logout.mutate(undefined, {
      onSuccess: () => void navigate({ to: "/auth/signed-out" }),
      onError: () => notify.danger("Sign out failed. Please try again."),
    });
}
