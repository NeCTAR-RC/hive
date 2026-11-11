import { describe, expect, it } from "vitest";
import { accessRuleDefaults, accessToError, accessTypesFor } from "./access";

describe("accessTypesFor", () => {
  it.each([
    { protocol: "CEPHFS", types: ["cephx"] },
    { protocol: "CephFS", types: ["cephx"] },
    { protocol: "NFS", types: ["ip"] },
    { protocol: "CIFS", types: ["ip", "user"] },
    { protocol: "MYSTERYFS", types: ["ip", "user", "cert", "cephx"] },
    { protocol: null, types: ["ip", "user", "cert", "cephx"] },
  ])("offers $types on a $protocol share", ({ protocol, types }) => {
    expect(accessTypesFor(protocol).map((type) => type.id)).toEqual(types);
  });
});

describe("accessRuleDefaults", () => {
  it.each([
    { protocol: "CEPHFS", type: "cephx" },
    { protocol: "cephfs", type: "cephx" },
    { protocol: "NFS", type: "ip" },
    { protocol: null, type: "ip" },
  ])("grants a $protocol share to $type with read and write", (row) => {
    expect(accessRuleDefaults(row.protocol)).toEqual({
      access_type: row.type,
      access_to: "",
      access_level: "rw",
    });
  });
});

describe("accessToError", () => {
  it.each([
    ["ip", "203.0.113.10"],
    ["ip", "203.0.113.0/24"],
    ["ip", "2001:db8::/32"],
    ["user", "alice"],
    ["user", "alice.smith@corp"],
    ["cert", "client.example.org"],
    ["cephx", "alice_data-1"],
  ])("accepts %s %s", (type, value) => {
    expect(accessToError(type, value)).toBeNull();
  });

  it.each([
    ["ip", "203.0.113.300", "Enter an IP address or network"],
    ["ip", "bad user!", "Enter an IP address or network"],
    ["user", "bob", "Use 4 to 255 characters"],
    ["user", "CORP\\alice", "Use 4 to 255 characters"],
    ["user", "....", "Use 4 to 255 characters"],
    ["cert", "x".repeat(65), "Use 64 characters or fewer"],
    ["cephx", "bad user!", "Use letters, digits, dashes and underscores"],
    ["cephx", "client.alice", "without the client. prefix"],
  ])("refuses %s %s", (type, value, message) => {
    expect(accessToError(type, value)).toContain(message);
  });
});
