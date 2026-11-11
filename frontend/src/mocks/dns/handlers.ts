// Mocked API for the DNS panels: zones and record sets.
// The in-memory state is the backend for one page load; handlers change
// it in place, so a create or delete shows up in the following list.
import { http, HttpResponse } from "msw";
import type { RecordSet, Zone } from "../../lib/api/types/dns";
import { nextId } from "../ids";
import { apiError, notFound, readBody, type Reply } from "../http";
import {
  recordSetCreateBody,
  recordSetUpdateBody,
  zoneCreateBody,
  zoneUpdateBody,
} from "./schemas";

let zones: Zone[] = [
  {
    id: "zone-1",
    name: "example.org.",
    type: "PRIMARY",
    email: "admin@example.org",
    ttl: 3600,
    serial: 7,
    description: "Lab zone",
    status: "ACTIVE",
    action: "NONE",
    masters: [],
    shared: false,
    created_at: "2026-09-01T00:00:00",
    updated_at: null,
    is_transitional: false,
  },
];
let recordsets: RecordSet[] = [
  {
    id: "rs-soa",
    zone_id: "zone-1",
    name: "example.org.",
    type: "SOA",
    ttl: null,
    description: null,
    records: ["ns1.example.net. admin.example.org. 7 3600 600 86400 3600"],
    status: "ACTIVE",
    action: "NONE",
    created_at: null,
    updated_at: null,
    is_transitional: false,
    can_edit: false,
  },
  {
    id: "rs-ns",
    zone_id: "zone-1",
    name: "example.org.",
    type: "NS",
    ttl: null,
    description: null,
    records: ["ns1.example.net."],
    status: "ACTIVE",
    action: "NONE",
    created_at: null,
    updated_at: null,
    is_transitional: false,
    can_edit: false,
  },
  {
    id: "rs-www",
    zone_id: "zone-1",
    name: "www.example.org.",
    type: "A",
    ttl: 300,
    description: null,
    records: ["203.0.113.10"],
    status: "ACTIVE",
    action: "NONE",
    created_at: null,
    updated_at: null,
    is_transitional: false,
    can_edit: true,
  },
];

export const dnsHandlers = [
  http.get("/api/dns/zones", () =>
    HttpResponse.json<Reply<"/api/dns/zones", "get">>({
      items: zones,
      quota: { zones: 10, zone_recordsets: 500 },
      record_types: [
        "A",
        "AAAA",
        "CNAME",
        "MX",
        "NS",
        "PTR",
        "SPF",
        "SRV",
        "SSHFP",
        "TXT",
        "CAA",
      ],
    }),
  ),
  http.post("/api/dns/zones", async ({ request }) => {
    const body = await readBody(request, zoneCreateBody);
    if (!body.name.endsWith(".")) {
      return apiError(
        400,
        "bad_request",
        "The zone name must end with a dot, such as example.com.",
      );
    }
    const zone: Zone = {
      ...zones[0]!,
      id: nextId("zone"),
      name: body.name,
      email: body.email,
      ttl: body.ttl ?? 3600,
      description: body.description ?? null,
      status: "PENDING",
      action: "CREATE",
      is_transitional: true,
    };
    zones.push(zone);
    return HttpResponse.json<Reply<"/api/dns/zones", "post">>(zone, {
      status: 202,
    });
  }),
  http.get("/api/dns/zones/:id", ({ params }) => {
    const zone = zones.find((z) => z.id === params["id"]);
    return zone
      ? HttpResponse.json<Reply<"/api/dns/zones/{zone_id}", "get">>(zone)
      : notFound();
  }),
  http.patch("/api/dns/zones/:id", async ({ params, request }) => {
    const body = await readBody(request, zoneUpdateBody);
    const zone = zones.find((z) => z.id === params["id"]);
    if (zone) Object.assign(zone, body);
    return HttpResponse.json<Reply<"/api/dns/zones/{zone_id}", "patch">>(zone);
  }),
  http.delete("/api/dns/zones/:id", ({ params }) => {
    zones = zones.filter((z) => z.id !== params["id"]);
    return new HttpResponse(null, { status: 204 });
  }),
  http.get("/api/dns/zones/:id/recordsets", ({ params }) => {
    const zone = zones.find((z) => z.id === params["id"]);
    if (!zone) return notFound();
    return HttpResponse.json<
      Reply<"/api/dns/zones/{zone_id}/recordsets", "get">
    >({
      zone,
      items: recordsets.filter((r) => r.zone_id === params["id"]),
    });
  }),
  http.post("/api/dns/zones/:id/recordsets", async ({ params, request }) => {
    const body = await readBody(request, recordSetCreateBody);
    const zone = zones.find((z) => z.id === params["id"]);
    const name = body.name
      ? body.name.endsWith(".")
        ? body.name
        : `${body.name}.${zone?.name}`
      : (zone?.name ?? "");
    // Designate refuses a second record set with the same name and type.
    if (recordsets.some((r) => r.name === name && r.type === body.type)) {
      return apiError(409, "conflict", "Duplicate RecordSet");
    }
    const recordset: RecordSet = {
      id: nextId("rs"),
      zone_id: String(params["id"]),
      name,
      type: body.type,
      ttl: body.ttl ?? null,
      description: null,
      records: body.records,
      status: "PENDING",
      action: "CREATE",
      created_at: null,
      updated_at: null,
      is_transitional: false,
      can_edit: true,
    };
    recordsets.push(recordset);
    return HttpResponse.json<
      Reply<"/api/dns/zones/{zone_id}/recordsets", "post">
    >(recordset, { status: 202 });
  }),
  http.put("/api/dns/zones/:id/recordsets/:rs", async ({ params, request }) => {
    const body = await readBody(request, recordSetUpdateBody);
    const recordset = recordsets.find((r) => r.id === params["rs"]);
    if (recordset) {
      recordset.records = body.records;
      if (body.ttl !== undefined) recordset.ttl = body.ttl;
    }
    return HttpResponse.json<
      Reply<"/api/dns/zones/{zone_id}/recordsets/{recordset_id}", "put">
    >(recordset);
  }),
  http.delete("/api/dns/zones/:id/recordsets/:rs", ({ params }) => {
    recordsets = recordsets.filter((r) => r.id !== params["rs"]);
    return new HttpResponse(null, { status: 204 });
  }),
];
