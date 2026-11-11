import { describe, expect, it } from "vitest";
import type { Credential } from "../../../lib/api/types/identity";
import { ec2AccessKey, otherProjectKeys } from "./ec2";

function credential(
  id: string,
  type: string,
  projectId: string | null,
): Credential {
  return { id, type, project_id: projectId, blob: "{}" };
}

describe("ec2AccessKey", () => {
  it("reads the access key from the credential data", () => {
    expect(ec2AccessKey('{"access": "AK1", "secret": "S"}')).toBe("AK1");
  });

  it("gives nothing for data of another shape", () => {
    expect(ec2AccessKey("SEED")).toBeUndefined();
    expect(ec2AccessKey("null")).toBeUndefined();
    expect(ec2AccessKey('{"access": 1}')).toBeUndefined();
    expect(ec2AccessKey('{"access": ""}')).toBeUndefined();
  });
});

describe("otherProjectKeys", () => {
  it("keeps the EC2 keys of the other projects only", () => {
    const here = credential("a", "ec2", "p1");
    const there = credential("b", "ec2", "p2");
    const totp = credential("c", "totp", null);
    expect(otherProjectKeys([here, there, totp], "p1")).toEqual([there]);
  });
});
