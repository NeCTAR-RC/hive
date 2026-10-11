import { describe, expect, it } from "vitest";
import { buildLoginUrl, safeNext } from "./login";

const config = {
  login_base_url: "https://accounts.test/login",
  login_base_url_nz:
    "https://accounts.test/Shibboleth.sso/DS-Tuakiri?return-path=/login/",
  receiver_url: "https://hive.test/auth/websso/",
};

describe("buildLoginUrl", () => {
  it("folds next into the receiver inside return-path", () => {
    const url = new URL(buildLoginUrl(config, "/compute/instances?page=2"));
    expect(url.origin + url.pathname).toBe("https://accounts.test/login");
    const returnPath = url.searchParams.get("return-path");
    expect(returnPath).toBe(
      "https://hive.test/auth/websso/?next=%2Fcompute%2Finstances%3Fpage%3D2",
    );
  });

  it("omits next when there is none", () => {
    const url = new URL(buildLoginUrl(config, undefined));
    expect(url.searchParams.get("return-path")).toBe(config.receiver_url);
  });

  it("appends to the existing query of the Tuakiri URL", () => {
    const url = buildLoginUrl(config, "/", true);
    expect(url.startsWith(config.login_base_url_nz + "&return-path=")).toBe(
      true,
    );
  });

  it("falls back to AAF when no Tuakiri URL is configured", () => {
    const url = buildLoginUrl(
      { ...config, login_base_url_nz: null },
      "/",
      true,
    );
    expect(url.startsWith("https://accounts.test/login?")).toBe(true);
  });
});

describe("safeNext", () => {
  it("accepts relative single-slash paths only", () => {
    expect(safeNext("/compute/instances?x=1")).toBe("/compute/instances?x=1");
    expect(safeNext("https://evil.test/")).toBe("/");
    expect(safeNext("//evil.test/")).toBe("/");
    expect(safeNext("/auth/login")).toBe("/");
    expect(safeNext("/x\r\nSet-Cookie: a=b")).toBe("/");
    expect(safeNext(undefined)).toBe("/");
  });
});
