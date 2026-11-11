import { useEffect, useState } from "react";
import { useRouter } from "@tanstack/react-router";

/**
 * The open state of the navigation dialog that the mobile header's button
 * toggles. The dialog closes once any navigation resolves, so a row that
 * leads to another page never leaves it open over that page.
 */
export function useNavigationDialog() {
  const router = useRouter();
  const [isOpen, setOpen] = useState(false);
  useEffect(
    () => router.subscribe("onResolved", () => setOpen(false)),
    [router],
  );
  return {
    isOpen,
    setOpen,
    toggle: () => setOpen((open) => !open),
  };
}
