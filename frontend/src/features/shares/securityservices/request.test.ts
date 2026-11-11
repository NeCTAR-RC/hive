import { describe, expect, it } from "vitest";
import type { SecurityService } from "../../../lib/api/types/shares";
import {
  securityServiceBody,
  securityServiceUpdateBody,
} from "../../../mocks/shares/schemas";
import {
  createSecurityServiceBody,
  updateSecurityServiceBody,
  type SecurityServiceValues,
} from "./request";

/** A stored LDAP service with every optional field set. */
const service: SecurityService = {
  id: "ss-1",
  name: "campus-ldap",
  description: "Campus directory",
  type: "ldap",
  type_label: "LDAP",
  dns_ip: "10.0.0.2",
  ou: "research",
  server: "ldap.example.edu.au",
  domain: "example.edu.au",
  user: "binder",
  status: "new",
  created_at: "2026-10-01T00:00:00Z",
};

/** The edit form as it opens for `service`. */
const opened: SecurityServiceValues = {
  name: "campus-ldap",
  type: "ldap",
  dns_ip: "10.0.0.2",
  server: "ldap.example.edu.au",
  domain: "example.edu.au",
  ou: "research",
  user: "binder",
  password: "",
  confirm_password: "",
  description: "Campus directory",
};

/** The create form filled in with only the required fields. */
const required: SecurityServiceValues = {
  name: "campus-ad",
  type: "active_directory",
  dns_ip: "10.0.0.3",
  server: "ad.example.edu.au",
  domain: "example.edu.au",
  ou: "",
  user: "",
  password: "",
  confirm_password: "",
  description: "",
};

describe("createSecurityServiceBody", () => {
  it.each([
    {
      variant: "leaves out every optional field left empty",
      values: required,
      body: {
        name: "campus-ad",
        type: "active_directory",
        dns_ip: "10.0.0.3",
        server: "ad.example.edu.au",
        domain: "example.edu.au",
      },
    },
    {
      variant: "sends every optional field that was filled in",
      values: {
        ...required,
        ou: "research",
        user: "binder",
        password: "s3cret",
        confirm_password: "s3cret",
        description: "Campus directory",
      },
      body: {
        name: "campus-ad",
        type: "active_directory",
        dns_ip: "10.0.0.3",
        server: "ad.example.edu.au",
        domain: "example.edu.au",
        ou: "research",
        user: "binder",
        password: "s3cret",
        description: "Campus directory",
      },
    },
  ])("$variant", ({ values, body }) => {
    expect(createSecurityServiceBody(values)).toEqual(body);
    expect(securityServiceBody.safeParse(body).success).toBe(true);
  });
});

describe("updateSecurityServiceBody", () => {
  it.each([
    {
      variant: "sends only the name when nothing changed",
      values: opened,
      body: { name: "campus-ldap" },
    },
    {
      variant: "sends a changed field and an emptied one as an empty string",
      values: { ...opened, server: "ldap2.example.edu.au", ou: "" },
      body: { name: "campus-ldap", server: "ldap2.example.edu.au", ou: "" },
    },
    {
      variant: "sends a password only when one was typed",
      values: { ...opened, password: "n3w", confirm_password: "n3w" },
      body: { name: "campus-ldap", password: "n3w" },
    },
  ])("$variant", ({ values, body }) => {
    expect(updateSecurityServiceBody(service, values)).toEqual(body);
    expect(securityServiceUpdateBody.safeParse(body).success).toBe(true);
  });

  it("counts a field the service lacks as empty, so leaving it empty sends nothing", () => {
    const bare = { ...service, ou: null, user: null };
    expect(
      updateSecurityServiceBody(bare, { ...opened, ou: "", user: "" }),
    ).toEqual({ name: "campus-ldap" });
  });
});
