// The ARDC website's own mega menu and footer, as web components, the way
// langstroth (status.rc.nectar.org.au) embeds them. Each loader is a plain
// external script from ardc.edu.au, appended once with no inline <script>;
// it fetches a manifest from ardc.edu.au, then the component bundle, Figtree
// fonts and (footer sign-up form) Cloudflare Turnstile, which the CSP in
// backend/hive/config.py allows.

export type ArdcComponent = "megamenu" | "footer";

const LOADER_BASE =
  "https://ardc.edu.au/wp-content/plugins/ardc-custom-web-components/dist/loaders";

const loading = new Map<ArdcComponent, Promise<void>>();

/** Load a component's loader script once; rejects if it fails to load. */
export function loadArdcComponent(name: ArdcComponent): Promise<void> {
  let promise = loading.get(name);
  if (!promise) {
    promise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      // Classic, not a module: the loader reads document.currentScript.
      script.src = `${LOADER_BASE}/${name}.min.js`;
      script.async = true;
      script.addEventListener("load", () => resolve(), { once: true });
      script.addEventListener(
        "error",
        () => reject(new Error(`ARDC ${name} loader failed`)),
        { once: true },
      );
      document.head.appendChild(script);
    });
    loading.set(name, promise);
  }
  return promise;
}

/** Test hook: forget what has been loaded. */
export function resetArdcComponentsForTests(): void {
  loading.clear();
}
