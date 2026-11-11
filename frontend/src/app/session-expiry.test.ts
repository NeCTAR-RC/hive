import { describe, expect, it, vi } from "vitest";
import { createSessionExpiryHandler } from "./session-expiry";

function setup(pathname = "/compute/instances", search = "?q=web") {
  let finish = () => {};
  const redirectToLogin = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  const expire = createSessionExpiryHandler({
    location: () => ({ pathname, search }),
    redirectToLogin,
  });
  return { expire, redirectToLogin, finish: () => finish() };
}

describe("createSessionExpiryHandler", () => {
  it("redirects once for 401s that arrive together, remembering the page", () => {
    const { expire, redirectToLogin } = setup();
    expire();
    expire();
    expire();
    expect(redirectToLogin).toHaveBeenCalledTimes(1);
    expect(redirectToLogin).toHaveBeenCalledWith("/compute/instances?q=web");
  });

  it("handles a later 401 once the redirect has finished", async () => {
    const { expire, redirectToLogin, finish } = setup();
    expire();
    finish();
    await vi.waitFor(() => {
      expire();
      expect(redirectToLogin).toHaveBeenCalledTimes(2);
    });
  });

  it.each([["/auth/login"], ["/auth/signed-out"], ["/terms"]])(
    "does nothing on %s",
    (pathname) => {
      const { expire, redirectToLogin } = setup(pathname, "");
      expire();
      expect(redirectToLogin).not.toHaveBeenCalled();
    },
  );
});
