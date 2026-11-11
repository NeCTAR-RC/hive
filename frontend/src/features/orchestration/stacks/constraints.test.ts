import { describe, expect, it } from "vitest";
import { constraintHint, constraintOptions, isSourced } from "./constraints";

const CHOICES = [
  { id: "img-1", name: "Ubuntu 24.04", label: "Ubuntu 24.04" },
  { id: "img-2", name: "Debian 12", label: "Debian 12" },
];

describe("isSourced", () => {
  it("offers the common constraints as a choice", () => {
    expect(isSourced("nova.keypair")).toBe(true);
    expect(isSourced("cinder.volume")).toBe(true);
    expect(isSourced("nova.host")).toBe(false);
    expect(isSourced(null)).toBe(false);
  });
});

describe("constraintHint", () => {
  it("says plainly what the value must be", () => {
    expect(constraintHint("nova.keypair")).toBe(
      "Must be one of your key pairs",
    );
    expect(constraintHint("neutron.subnet")).toBe("Must be a subnet");
    expect(constraintHint("designate.zone")).toBe(
      "Heat checks this value when the stack launches",
    );
  });
});

describe("constraintOptions", () => {
  it("offers the resources by id", () => {
    expect(constraintOptions(CHOICES, "")).toEqual([
      { id: "img-1", label: "Ubuntu 24.04" },
      { id: "img-2", label: "Debian 12" },
    ]);
    expect(constraintOptions(CHOICES, "img-2")).toHaveLength(2);
  });

  it("selects a resource the template default names", () => {
    expect(constraintOptions(CHOICES, "Debian 12")).toEqual([
      { id: "img-1", label: "Ubuntu 24.04" },
      { id: "Debian 12", label: "Debian 12" },
    ]);
  });

  it("keeps a default the project does not list", () => {
    expect(constraintOptions(CHOICES, "CentOS 7")).toEqual([
      { id: "img-1", label: "Ubuntu 24.04" },
      { id: "img-2", label: "Debian 12" },
      { id: "CentOS 7", label: "CentOS 7 (from the template)" },
    ]);
  });
});
