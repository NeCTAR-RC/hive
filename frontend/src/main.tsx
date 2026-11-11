import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { RouterProvider as AriaRouterProvider } from "react-aria-components";
import { createQueryClient } from "./app/query-client";
import { createAppRouter } from "./app/router";
import { Providers } from "./app/providers";
import { createSessionExpiryHandler } from "./app/session-expiry";
import { loadSiteExtras } from "./lib/extras";
import { configQuery } from "./lib/queries";
import { loadMegamenu } from "./shell/megamenu";
import "./styles/global.scss";

// First, so the agency mega menu loads alongside the app.
loadMegamenu();

async function prepare() {
  // Mocked API for UI work and end-to-end tests without a backend.
  if (import.meta.env.VITE_MOCK === "1") {
    const { startMockApi } = await import("./mocks/browser");
    await startMockApi();
  }
}

function mount(container: HTMLElement) {
  const queryClient = createQueryClient({
    // A 401 anywhere means the session is gone: back through manuka.
    onUnauthenticated: createSessionExpiryHandler({
      location: () => window.location,
      redirectToLogin: async (next) => {
        queryClient.clear();
        await router.navigate({
          to: "/auth/login",
          search: { next, reason: "expired" },
        });
      },
    }),
  });
  const router = createAppRouter(queryClient);

  // Analytics and the help widget, when the deployment configures them.
  queryClient
    .ensureQueryData(configQuery)
    .then(loadSiteExtras)
    .catch(() => {
      // No config, no extras: the pages that need it report the failure.
    });

  createRoot(container).render(
    <StrictMode>
      <Providers queryClient={queryClient}>
        {/* React Aria links and menu items navigate through the app router. */}
        <AriaRouterProvider navigate={(href) => void router.navigate({ href })}>
          <RouterProvider router={router} />
        </AriaRouterProvider>
      </Providers>
    </StrictMode>,
  );
}

const container = document.getElementById("root");
if (!container) throw new Error("index.html has no #root element");
void prepare().then(() => mount(container));
