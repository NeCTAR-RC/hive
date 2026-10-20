import { act, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ArdcFooter } from "./ArdcFooter";
import { ArdcMegamenu } from "./ArdcMegamenu";
import { loadArdcComponent, resetArdcComponentsForTests } from "./loader";

const LOADERS =
  "https://ardc.edu.au/wp-content/plugins/ardc-custom-web-components/dist/loaders";

function loader(name: string) {
  return document.head.querySelector<HTMLScriptElement>(
    `script[src="${LOADERS}/${name}.min.js"]`,
  );
}

describe("ARDC web components", () => {
  afterEach(() => {
    resetArdcComponentsForTests();
    document.head.innerHTML = "";
  });

  it("appends each loader once, as a classic external script", () => {
    void loadArdcComponent("megamenu");
    void loadArdcComponent("megamenu");
    expect(document.head.querySelectorAll("script")).toHaveLength(1);
    expect(loader("megamenu")?.type).toBe("");
  });

  it("hides the mega menu when its loader fails", async () => {
    const { container } = render(<ArdcMegamenu />);
    const menu = container.querySelector<HTMLElement>("ardc-megamenu")!;
    expect(menu.getAttribute("data-host")).toBe("ARDC Main Website");
    expect(menu.hidden).toBe(false);
    await act(async () => {
      loader("megamenu")!.dispatchEvent(new Event("error"));
    });
    expect(menu.hidden).toBe(true);
  });

  it("gives the footer its links in the slots langstroth uses", () => {
    const { container } = render(<ArdcFooter />);
    const footer = container.querySelector("ardc-footer")!;
    expect(footer.hasAttribute("data-show-ardc-logo")).toBe(true);
    expect(footer.getAttribute("data-content-width")).toBe("wide");
    expect(footer.querySelectorAll("#quick-links a")).toHaveLength(7);
    expect(footer.querySelectorAll("#legal-links a")).toHaveLength(3);
    expect(footer.querySelector("#ardc-footer-acn")?.textContent).toBe(
      "ACN 633 798 857",
    );
    expect(loader("footer")).not.toBeNull();
  });
});
