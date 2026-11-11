import { afterEach, describe, expect, it } from "vitest";
import { loadMegamenu, MEGAMENU_ID, MEGAMENU_LOADER } from "./megamenu";

/** The mega menu element as index.html places it. */
function placeMenu(): HTMLElement {
  const menu = document.createElement("ardc-megamenu");
  menu.id = MEGAMENU_ID;
  document.body.append(menu);
  return menu;
}

const loaders = () => document.head.querySelectorAll("script");

afterEach(() => {
  document.head.replaceChildren();
  document.body.replaceChildren();
});

describe("loadMegamenu", () => {
  it("appends the agency loader, with no inline script", () => {
    placeMenu();
    loadMegamenu();
    expect([...loaders()].map((script) => script.src)).toEqual([
      MEGAMENU_LOADER,
    ]);
    expect(document.querySelector("script:not([src])")).toBeNull();
  });

  it("hides the menu when its loader fails, and only then", () => {
    const menu = placeMenu();
    loadMegamenu();
    loaders()[0]?.dispatchEvent(new Event("load"));
    expect(menu.hidden).toBe(false);
    loaders()[0]?.dispatchEvent(new Event("error"));
    expect(menu.hidden).toBe(true);
  });

  it("loads nothing on a page without the menu", () => {
    loadMegamenu();
    expect(loaders()).toHaveLength(0);
  });
});
