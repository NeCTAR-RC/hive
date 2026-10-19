import { describe, expect, it } from "vitest";
import { containerFormat } from "./presentation";

describe("containerFormat", () => {
  it("pairs the Amazon formats with their own container format", () => {
    expect(containerFormat("ami")).toBe("ami");
    expect(containerFormat("aki")).toBe("aki");
    expect(containerFormat("ari")).toBe("ari");
  });

  it("uses bare for every other disk format", () => {
    expect(containerFormat("qcow2")).toBe("bare");
    expect(containerFormat("raw")).toBe("bare");
    expect(containerFormat("iso")).toBe("bare");
  });
});
