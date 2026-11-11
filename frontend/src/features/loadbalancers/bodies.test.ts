import { describe, expect, it } from "vitest";
import { httpCheckPart, insertHeadersPart, sessionPersistence } from "./bodies";

describe("sessionPersistence", () => {
  it.each([
    ["", "", null],
    ["", "ignored", null],
    ["SOURCE_IP", "ignored", { type: "SOURCE_IP" }],
    ["HTTP_COOKIE", "ignored", { type: "HTTP_COOKIE" }],
    ["APP_COOKIE", "session", { type: "APP_COOKIE", cookie_name: "session" }],
  ])("%j with cookie %j is %j", (persistence, cookie, expected) => {
    expect(sessionPersistence(persistence, cookie)).toEqual(expected);
  });
});

describe("insertHeadersPart", () => {
  const headers = { xff: true, xfp: false, xfproto: true };

  it.each(["HTTP", "TERMINATED_HTTPS"])(
    "sends the forwarded headers on %s",
    (protocol) => {
      expect(insertHeadersPart(protocol, headers)).toEqual({
        insert_headers: {
          "X-Forwarded-For": true,
          "X-Forwarded-Port": false,
          "X-Forwarded-Proto": true,
        },
      });
    },
  );

  it.each(["HTTPS", "TCP", "UDP", "SCTP"])(
    "sends nothing on %s",
    (protocol) => {
      expect(insertHeadersPart(protocol, headers)).toEqual({});
    },
  );
});

describe("httpCheckPart", () => {
  const check = {
    http_method: "HEAD",
    url_path: "/health",
    expected_codes: "200-204",
  };

  it.each(["HTTP", "HTTPS"])("sends the check as typed on %s", (type) => {
    expect(httpCheckPart({ ...check, type })).toEqual({
      http_method: "HEAD",
      url_path: "/health",
      expected_codes: "200-204",
    });
  });

  it("reads a blank path and codes as Octavia's defaults", () => {
    expect(
      httpCheckPart({
        type: "HTTP",
        http_method: "GET",
        url_path: "",
        expected_codes: "",
      }),
    ).toEqual({ http_method: "GET", url_path: "/", expected_codes: "200" });
  });

  it.each(["TCP", "PING", "UDP-CONNECT"])("sends nothing on %s", (type) => {
    expect(httpCheckPart({ ...check, type })).toEqual({});
  });
});
