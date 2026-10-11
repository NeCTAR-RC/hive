import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { RouterProvider as AriaRouterProvider } from "react-aria-components";
import { createQueryClient } from "./app/query-client";
import { createAppRouter } from "./app/router";
import { Providers } from "./app/providers";
import "./styles/global.scss";

async function prepare() {
  // Mocked API for UI work and end-to-end tests without a backend.
  if (import.meta.env.VITE_MOCK === "1") {
    const { worker } = await import("./mocks/browser");
    await worker.start({ onUnhandledFrame: "bypass", quiet: true });
  }
}

void prepare().then(() => {
  const queryClient = createQueryClient();
  const router = createAppRouter(queryClient);

  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <Providers queryClient={queryClient}>
        {/* React Aria links and menu items navigate through the app router. */}
        <AriaRouterProvider navigate={(href) => router.navigate({ href })}>
          <RouterProvider router={router} />
        </AriaRouterProvider>
      </Providers>
    </StrictMode>,
  );
});
