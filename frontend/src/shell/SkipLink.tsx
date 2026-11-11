import { useRouterState } from "@tanstack/react-router";
import { Link } from "@ardc-ui/react";
import styles from "./SkipLink.module.scss";

/**
 * The app's first tab stop (the agency mega menu's "Explore ARDC" comes
 * before it in the page): jumps past the header to `#main`. The library
 * `Link` drawn as a small primary button, as shipped (the secondary button
 * is unfilled and would show the header through it); it stays hidden until
 * it has focus.
 *
 * React Aria hands same-origin links to the app router, which resolves a
 * bare "#main" against the site root, so the href carries the current path
 * and query. A router navigation does not move focus the way a native
 * fragment link does, so the press moves it to `main` itself.
 */
export function SkipLink() {
  const location = useRouterState({ select: (state) => state.location });
  return (
    <div className={styles.skip}>
      <Link
        variant="primary"
        size="sm"
        href={`${location.pathname}${location.searchStr}#main`}
        onPress={() => document.getElementById("main")?.focus()}
      >
        Skip to main content
      </Link>
    </div>
  );
}
