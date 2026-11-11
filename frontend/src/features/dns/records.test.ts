import { describe, expect, it } from "vitest";
import type { RecordSet } from "../../lib/api/types/dns";
import {
  absoluteName,
  duplicateRecordSet,
  recordsError,
  recordSetUpdateBody,
  recordsHint,
  splitRecords,
  withArticle,
} from "./records";

describe("splitRecords", () => {
  it.each([
    {
      case: "reads one record per line",
      text: "192.0.2.1\n192.0.2.2",
      records: ["192.0.2.1", "192.0.2.2"],
    },
    {
      case: "trims each line and drops blank ones",
      text: "  192.0.2.1 \n\n   \n192.0.2.2\n",
      records: ["192.0.2.1", "192.0.2.2"],
    },
    {
      case: "keeps the spaces inside a record",
      text: '10 mail.example.com.\n"v=spf1 -all"',
      records: ["10 mail.example.com.", '"v=spf1 -all"'],
    },
    { case: "reads nothing from blank text", text: " \n ", records: [] },
  ])("$case", ({ text, records }) => {
    expect(splitRecords(text)).toEqual(records);
  });
});

describe("recordSetUpdateBody", () => {
  const values = { records: "203.0.113.10\n\n203.0.113.11", description: "" };

  it("sends the TTL typed", () => {
    expect(recordSetUpdateBody({ ...values, ttl: 300 })).toEqual({
      records: ["203.0.113.10", "203.0.113.11"],
      ttl: 300,
      description: "",
    });
  });

  it("sends a blank TTL as null, which restores the zone default", () => {
    expect(recordSetUpdateBody({ ...values, ttl: undefined }).ttl).toBeNull();
    expect(recordSetUpdateBody(values).ttl).toBeNull();
  });
});

describe("recordsError", () => {
  it.each([
    ["A", "203.0.113.10"],
    ["AAAA", "2001:db8::10"],
    ["CNAME", "www.example.com."],
    ["NS", "ns1.example.com."],
    ["PTR", "host.example.com."],
    ["MX", "10 mail.example.com."],
    ["SRV", "10 5 5060 sip.example.com."],
    ["SSHFP", "1 1 0123456789abcdef"],
    ["CAA", '0 issue "letsencrypt.org"'],
    ["TXT", "anything at all!"],
    ["SPF", "v=spf1 -all"],
    ["LOC", "an unknown type is left to Designate"],
  ])("accepts a %s record: %s", (type, record) => {
    expect(recordsError(type, [record])).toBeNull();
  });

  it.each([
    ["A", "203.0.113.300", '"203.0.113.300" is not an IPv4 address'],
    ["A", "foo", '"foo" is not an IPv4 address'],
    ["A", "2001:db8::10", '"2001:db8::10" is not an IPv4 address'],
    ["AAAA", "203.0.113.10", '"203.0.113.10" is not an IPv6 address'],
    [
      "CNAME",
      "www.example.com",
      '"www.example.com" is not a host name ending with a dot',
    ],
    ["NS", "bad name.", '"bad name." is not a host name ending with a dot'],
    [
      "MX",
      "mail.example.com.",
      '"mail.example.com." is not a priority and a mail host ending with a dot',
    ],
    [
      "MX",
      "70000 mail.example.com.",
      '"70000 mail.example.com." is not a priority and a mail host ending with a dot',
    ],
    [
      "SRV",
      "10 5 sip.example.com.",
      '"10 5 sip.example.com." is not a priority, weight, port and target ending with a dot',
    ],
    [
      "SSHFP",
      "1 1 xyz",
      '"1 1 xyz" is not an algorithm, a type and a hexadecimal fingerprint',
    ],
    [
      "CAA",
      "issue letsencrypt.org",
      '"issue letsencrypt.org" is not flags, a tag and a value',
    ],
  ])("refuses a %s record: %s", (type, record, message) => {
    expect(recordsError(type, [record])).toBe(message);
  });

  it("names the first bad record of several", () => {
    expect(recordsError("A", ["203.0.113.10", "foo", "bar"])).toBe(
      '"foo" is not an IPv4 address',
    );
  });

  it("asks for at least one record", () => {
    expect(recordsError("TXT", [])).toBe("Enter at least one record");
  });

  it("allows one CNAME record only", () => {
    expect(recordsError("CNAME", ["a.example.com.", "b.example.com."])).toBe(
      "A CNAME record set holds one record",
    );
  });
});

describe("recordsHint", () => {
  it("adds the type's example to the one-per-line rule", () => {
    expect(recordsHint("A")).toBe(
      "One per line. An IPv4 address, such as 203.0.113.10",
    );
  });

  it("says only the rule for a type without a hint", () => {
    expect(recordsHint("LOC")).toBe("One per line.");
  });
});

describe("absoluteName", () => {
  it.each([
    ["", "example.org."],
    ["@", "example.org."],
    ["www", "www.example.org."],
    [" www ", "www.example.org."],
    ["www.example.org.", "www.example.org."],
  ])("reads %j in example.org. as %s", (name, absolute) => {
    expect(absoluteName("example.org.", name)).toBe(absolute);
  });
});

describe("duplicateRecordSet", () => {
  const www = {
    id: "rs-www",
    name: "www.example.org.",
    type: "A",
  } as RecordSet;

  it("finds a record set with the same name and type", () => {
    expect(duplicateRecordSet([www], "example.org.", "WWW", "A")).toBe(www);
  });

  it("allows the same name with another type", () => {
    expect(
      duplicateRecordSet([www], "example.org.", "www", "AAAA"),
    ).toBeUndefined();
  });

  it("allows another name", () => {
    expect(
      duplicateRecordSet([www], "example.org.", "ftp", "A"),
    ).toBeUndefined();
  });
});

describe("withArticle", () => {
  it.each([
    ["A", "an A"],
    ["AAAA", "an AAAA"],
    ["MX", "an MX"],
    ["NS", "an NS"],
    ["SRV", "an SRV"],
    ["CNAME", "a CNAME"],
    ["PTR", "a PTR"],
    ["TXT", "a TXT"],
    ["CAA", "a CAA"],
  ])("reads %s as %s", (type, phrase) => {
    expect(withArticle(type)).toBe(phrase);
  });
});
