import { describe, expect, it } from "vitest";
import {
  checkPairAddress,
  checkPairMac,
  pairId,
  withoutPairs,
  withPair,
} from "./addressPairs";

const vip = { ip_address: "10.0.0.50", mac_address: "fa:16:3e:00:00:10" };
const range = { ip_address: "10.0.1.0/24", mac_address: "fa:16:3e:00:00:10" };

describe("address pair lists", () => {
  it("appends a new pair", () => {
    expect(withPair([vip], range)).toEqual([vip, range]);
  });

  it("removes pairs by address and MAC", () => {
    const other = { ...vip, mac_address: "fa:16:3e:00:00:99" };
    expect(withoutPairs([vip, range, other], [vip])).toEqual([range, other]);
    expect(pairId({ ip_address: "10.0.0.50", mac_address: null })).toBe(
      "10.0.0.50|",
    );
  });
});

describe("address pair checks", () => {
  it.each(["10.0.0.9", "10.0.0.0/24", "fd00::5", "fd00::/64"])(
    "accepts %s",
    (address) => {
      expect(checkPairAddress(address)).toBeNull();
    },
  );

  it.each(["", "10.0.0.300", "10.0.0.0/40", "vip"])(
    "refuses '%s'",
    (address) => {
      expect(checkPairAddress(address)).not.toBeNull();
    },
  );

  it("takes a blank MAC as the port's own", () => {
    expect(checkPairMac("")).toBeNull();
    expect(checkPairMac("FA:16:3E:00:00:01")).toBeNull();
    expect(checkPairMac("fa:16:3e")).toMatch(/MAC address/);
  });
});
