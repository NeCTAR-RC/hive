import { describe, expect, it } from "vitest";
import {
  chainStepLabel,
  defaultPort,
  isCidr,
  isIp,
  memberDefaultPort,
  operatingTone,
  persistenceTypesFor,
  poolProtocolFor,
  provisioningLabel,
  provisioningTone,
} from "./status";

describe("load balancer status helpers", () => {
  it("labels and tones provisioning and operating statuses", () => {
    expect(provisioningLabel("PENDING_CREATE")).toBe("Creating");
    expect(provisioningTone("PENDING_UPDATE")).toBe("progress");
    expect(provisioningTone("ERROR")).toBe("danger");
    expect(operatingTone("DEGRADED")).toBe("warning");
    expect(operatingTone("ONLINE")).toBe("success");
  });

  it("picks default ports and pool protocols like the Angular wizard", () => {
    expect(defaultPort("HTTP", [])).toBe(80);
    expect(defaultPort("TERMINATED_HTTPS", [443, 444])).toBe(445);
    expect(defaultPort("TCP", [])).toBeUndefined();
    expect(defaultPort("UDP", [80])).toBeUndefined();
    expect(memberDefaultPort("HTTP")).toBe(80);
    expect(memberDefaultPort("TCP")).toBeUndefined();
    expect(poolProtocolFor("TERMINATED_HTTPS")).toBe("HTTP");
    expect(poolProtocolFor("TCP")).toBe("TCP");
  });

  it("offers only SOURCE_IP persistence on UDP and SCTP pools", () => {
    const all = ["SOURCE_IP", "HTTP_COOKIE", "APP_COOKIE"];
    expect(persistenceTypesFor("UDP", all)).toEqual(["SOURCE_IP"]);
    expect(persistenceTypesFor("SCTP", all)).toEqual(["SOURCE_IP"]);
    expect(persistenceTypesFor("HTTP", all)).toEqual(all);
  });

  it("parses addresses and networks", () => {
    expect(isIp("10.0.0.1")).toBe(true);
    expect(isIp("2001:db8::1")).toBe(true);
    expect(isIp("1.2.3")).toBe(false);
    expect(isIp("300.1.1.1")).toBe(false);
    expect(isCidr("10.0.0.0/8")).toBe(true);
    expect(isCidr("2001:db8::/32")).toBe(true);
    expect(isCidr("::/999")).toBe(false);
    expect(isCidr("10.0.0.0/33")).toBe(false);
    expect(isCidr("10.0.0.0")).toBe(false);
  });

  it("labels chain steps", () => {
    expect(chainStepLabel("delete_member")).toBe("removing a member");
    expect(chainStepLabel(undefined)).toBe("working");
  });
});
