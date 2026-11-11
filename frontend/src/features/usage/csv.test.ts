import { describe, expect, it } from "vitest";
import type { UsageInstance } from "../../lib/api/types/usage";
import { usageCsv, usageCsvName } from "./csv";

function instance(overrides: Partial<UsageInstance>): UsageInstance {
  return {
    id: "i-1",
    name: "web-1",
    rate: 12.5,
    qty: 100,
    begin: null,
    end: null,
    display_name: "web-1",
    availability_zone: "melbourne-qh2",
    flavor_name: "m3.small",
    started_at: "2026-03-01T00:00:00+00:00",
    ended_at: null,
    ...overrides,
  };
}

describe("usageCsv", () => {
  it("writes a header and one line per instance", () => {
    expect(usageCsv([instance({})])).toBe(
      "Instance,Instance ID,Started,Ended,Availability zone,Flavour,Instance hours,Service units\r\n" +
        "web-1,i-1,2026-03-01T00:00:00+00:00,,melbourne-qh2,m3.small,100,12.5\r\n",
    );
  });

  it("quotes commas and quotes, and defuses formulas", () => {
    const csv = usageCsv([
      instance({ name: 'a, "b"' }),
      instance({ name: "=HYPERLINK(1)", qty: null }),
    ]);
    const [, first, second] = csv.split("\r\n");
    expect(first?.startsWith('"a, ""b""",i-1,')).toBe(true);
    expect(second?.startsWith("'=HYPERLINK(1),i-1,")).toBe(true);
    expect(second?.endsWith(",,12.5")).toBe(true);
  });
});

describe("usageCsvName", () => {
  it("names the project and the range", () => {
    expect(usageCsvName("research project/1", "2026-01-01", "2026-10-14")).toBe(
      "usage-research-project-1-2026-01-01-to-2026-10-14.csv",
    );
    expect(usageCsvName("", "a", "b")).toBe("usage-project-a-to-b.csv");
  });
});
