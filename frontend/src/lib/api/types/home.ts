/**
 * The home page: outages, ARDC news and the featured banners.
 *
 * Outages and news alias the generated contract (`../generated/openapi`).
 * The banners are not the backend's: the SPA reads `banner.json` from
 * Swift as the Horizon home page does, so their shape is declared here.
 */
import type { components } from "../generated/openapi";

type Schemas = components["schemas"];

export type Outage = Schemas["Outage"];
export type OutagesResponse = Schemas["OutagesResponse"];
export type NewsItem = Schemas["NewsItem"];
export type NewsResponse = Schemas["NewsResponse"];

/** A button on the featured banner; `color` is an ARDC colour name. */
export interface BannerButton {
  link: string;
  text: string;
  color?: string;
}

/**
 * One featured banner from the `banner.json` the Horizon home page reads
 * straight from Swift (nectar-dashboard `dashboard-home.js`). `info` may
 * carry inline HTML links.
 */
export interface BannerItem {
  title?: string;
  subtitle?: string;
  info?: string;
  bg_image?: string;
  button1?: BannerButton;
  button2?: BannerButton;
}
