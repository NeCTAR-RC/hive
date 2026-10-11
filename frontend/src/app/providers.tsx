import { QueryClientProvider } from "@tanstack/react-query";
import type { QueryClient } from "@tanstack/react-query";
import { ToastRegion } from "@ardc-ui/react";
import type { ReactNode } from "react";
import { toasts } from "../lib/notify";

export function Providers({
  queryClient,
  children,
}: {
  queryClient: QueryClient;
  children: ReactNode;
}) {
  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <ToastRegion queue={toasts} label="Notifications" closeLabel="Dismiss" />
    </QueryClientProvider>
  );
}
