import { describe, expect, it } from "vitest";
import { groupRisks, riskName, riskTone } from "./risks";

describe("security risks", () => {
  it("groups risks by resource in id order", () => {
    const groups = groupRisks([
      { id: 1, resource_id: "i-b", resource_type: "instance" },
      { id: 2, resource_id: "i-a", resource_type: "instance" },
      { id: 3, resource_id: "i-b", resource_type: "instance" },
    ]);
    expect(groups.map((g) => g.resourceId)).toEqual(["i-a", "i-b"]);
    expect(groups[1]?.risks).toHaveLength(2);
  });

  it("tones the count like Horizon", () => {
    expect(riskTone(0)).toBe("success");
    expect(riskTone(2)).toBe("warning");
    expect(riskTone(3)).toBe("danger");
  });

  it("prefers the display name", () => {
    expect(
      riskName({
        id: 1,
        resource_id: "x",
        resource_type: "instance",
        type: { name: "open-ssh", display_name: "Open SSH" },
      }),
    ).toBe("Open SSH");
    expect(
      riskName({ id: 1, resource_id: "x", resource_type: "instance" }),
    ).toBe("Security risk");
  });
});
