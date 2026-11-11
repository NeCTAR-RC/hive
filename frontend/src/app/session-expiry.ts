/** Pages a signed-out user is meant to see; a 401 there is expected. */
const SIGNED_OUT_PAGES = new Set(["/auth/login", "/auth/signed-out", "/terms"]);

/**
 * What happens when the backend says the session is gone: back to the login
 * page (and through manuka), remembering where the user was. Requests that
 * fail together (a page's parallel queries) trigger one redirect: while a
 * redirect runs, further calls are ignored. Nothing happens on the signed-out
 * pages themselves, so the login page can never redirect to itself.
 */
export function createSessionExpiryHandler({
  location,
  redirectToLogin,
}: {
  location: () => { pathname: string; search: string };
  /** Clears the user's data and navigates to the login page with `next`. */
  redirectToLogin: (next: string) => Promise<void>;
}): () => void {
  let redirecting = false;
  return () => {
    const { pathname, search } = location();
    if (redirecting || SIGNED_OUT_PAGES.has(pathname)) return;
    redirecting = true;
    void redirectToLogin(pathname + search).finally(() => {
      redirecting = false;
    });
  };
}
