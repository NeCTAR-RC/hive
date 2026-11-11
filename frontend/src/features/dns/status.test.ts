import { describe, expect, it } from "vitest";
import type { ActionOffer } from "../../lib/actions";
import type { RecordSet, Zone } from "../../lib/api/types/dns";
import {
  availableRecordSetActions,
  availableZoneActions,
  statusLabel,
  statusTone,
} from "./status";

describe("zone and record status", () => {
  it.each([
    { status: "ACTIVE", action: null, tone: "success", label: "Active" },
    {
      status: "PENDING",
      action: "CREATE",
      tone: "progress",
      label: "Pending (create)",
    },
    { status: "PENDING", action: "NONE", tone: "progress", label: "Pending" },
    { status: "PENDING", action: null, tone: "progress", label: "Pending" },
    { status: "ERROR", action: "UPDATE", tone: "danger", label: "Error" },
    { status: "DELETED", action: null, tone: "neutral", label: "Deleted" },
    { status: null, action: null, tone: "neutral", label: "Unknown" },
  ])("$status/$action is $label ($tone)", ({ status, action, tone, label }) => {
    expect(statusTone(status)).toBe(tone);
    expect(statusLabel(status, action)).toBe(label);
  });
});

const zone = (overrides: Partial<Zone> = {}): Zone => ({
  id: "z1",
  name: "example.com.",
  type: "PRIMARY",
  email: "admin@example.com",
  ttl: 3600,
  serial: 1,
  description: null,
  status: "ACTIVE",
  action: "NONE",
  masters: [],
  shared: false,
  created_at: null,
  updated_at: null,
  is_transitional: false,
  ...overrides,
});

const recordSet = (overrides: Partial<RecordSet> = {}): RecordSet => ({
  id: "r1",
  zone_id: "z1",
  name: "www.example.com.",
  type: "A",
  ttl: null,
  description: null,
  records: ["203.0.113.10"],
  status: "ACTIVE",
  action: "NONE",
  created_at: null,
  updated_at: null,
  is_transitional: false,
  can_edit: true,
  ...overrides,
});

/** The offers as `id: reason` pairs, with "" for an enabled action. */
const reasons = (offers: ActionOffer<string>[]) =>
  Object.fromEntries(offers.map((o) => [o.id, o.disabledReason ?? ""]));

describe("zone actions", () => {
  it("lists edit and delete, enabled on a settled zone", () => {
    expect(reasons(availableZoneActions(zone()))).toEqual({
      edit: "",
      delete: "",
    });
  });

  it("disables both while a change is pending", () => {
    expect(
      reasons(availableZoneActions(zone({ is_transitional: true }))),
    ).toEqual({
      edit: "Wait for the pending change to finish",
      delete: "Wait for the pending change to finish",
    });
  });
});

describe("record set actions", () => {
  it("lists edit and delete, enabled on an editable record set", () => {
    expect(reasons(availableRecordSetActions(recordSet()))).toEqual({
      edit: "",
      delete: "",
    });
  });

  it("disables both on a record set Designate manages", () => {
    const managed = recordSet({ can_edit: false, is_transitional: true });
    expect(reasons(availableRecordSetActions(managed))).toEqual({
      edit: "This record set is managed by the DNS service",
      delete: "This record set is managed by the DNS service",
    });
  });

  it("disables both while a change is pending", () => {
    const pending = recordSet({ is_transitional: true });
    expect(reasons(availableRecordSetActions(pending))).toEqual({
      edit: "Wait for the pending change to finish",
      delete: "Wait for the pending change to finish",
    });
  });
});
