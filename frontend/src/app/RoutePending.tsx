import { Loading } from "@ardc-ui/react";

/**
 * What a route shows while it is still loading, once the router's pending
 * delay has passed: the library `Loading`, as shipped. On a fast connection
 * a page's code arrives before the delay and this never appears. Inside the
 * dashboard it renders in place of the page, inside the shell; a slow
 * session check before the shell shows it on its own.
 */
export function RoutePending() {
  return <Loading>Loading page...</Loading>;
}
