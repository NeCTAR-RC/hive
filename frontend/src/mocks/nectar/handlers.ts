// Mocked API for the Nectar panels: members, user lookup, credentials,
// usage, reservations and the account endpoints.
// The in-memory state is the backend for one page load; handlers change
// it in place, so a create or delete shows up in the following list.
import { http, HttpResponse } from "msw";
import type {
  ApplicationCredential,
  Credential,
  Ec2Response,
  MemberRow,
  UserDetails,
} from "../../lib/api/types/identity";
import type {
  Reservation,
  ReservationFlavor,
  ReservationLimits,
  ReservationOptions,
} from "../../lib/api/types/reservations";
import type {
  AllocationUsage,
  UsageInstancesResponse,
} from "../../lib/api/types/usage";
import * as data from "../core/fixtures";
import { PROJECT_ID, USER_ID } from "../ids";
import { apiError, notFound, readBody, type Reply } from "../http";
import {
  applicationCredentialCreateBody,
  memberAddBody,
  profileUpdateBody,
  reservationCreateBody,
  reservationExtendBody,
} from "./schemas";

const now = () => Date.now() / 1000;
const DAY_MS = 86_400_000;

function isoDay(offset: number): string {
  return new Date(Date.now() + offset * DAY_MS).toISOString().slice(0, 10);
}

let members: MemberRow[] = [
  {
    id: "u1-r-member",
    user_id: USER_ID,
    name: "researcher@example.edu",
    role_id: "r-member",
    role_name: "member",
    is_self: true,
    can_remove: false,
  },
  {
    id: "u1-r-tm",
    user_id: USER_ID,
    name: "researcher@example.edu",
    role_id: "r-tm",
    role_name: "tenantmanager",
    is_self: true,
    can_remove: false,
  },
  {
    id: "u2-r-member",
    user_id: "u2",
    name: "ann@example.edu",
    role_id: "r-member",
    role_name: "member",
    is_self: false,
    can_remove: true,
  },
];

let appCredentials: ApplicationCredential[] = [
  {
    id: "ac-1",
    name: "deploy-bot",
    description: "CI deployments",
    project_id: PROJECT_ID,
    expires_at: "2027-01-10T00:00:00.000000Z",
    unrestricted: false,
    roles: [{ id: "r-member", name: "member", domain_id: null }],
    access_rules: [
      { service: "compute", method: "GET", path: "/v2.1/servers" },
    ],
  },
];

let ec2: Ec2Response = { credential: null, created: false };

let credentials: Credential[] = [
  { id: "cred-1", type: "ec2", project_id: "p2", blob: '{"access": "AK"}' },
];

const FLAVOR: ReservationFlavor = {
  id: "f1",
  name: "ardc.g3.xlarge",
  description: "L4 with 24GB of GPU RAM",
  category: "GPU",
  availability_zone: "ardctest-artm",
  vcpu: 64,
  memory_mb: 49152,
  disk_gb: 30,
  ephemeral_gb: 200,
  max_length_hours: 168,
  max_days: 7,
  rate: 0.899,
  is_public: true,
  active: true,
  slots: 1,
  start: null,
  end: null,
};

const FLAVOR_H4: ReservationFlavor = {
  id: "f2",
  name: "ardc.h4.large",
  description: "Large memory",
  category: "H4",
  availability_zone: "ardctest-artm",
  vcpu: 32,
  memory_mb: 376832,
  disk_gb: 30,
  ephemeral_gb: 0,
  max_length_hours: 336,
  max_days: 14,
  rate: 2,
  is_public: true,
  active: true,
  slots: 1,
  start: null,
  end: null,
};

/** A flavour with no free slot in the search window (listed in class H4). */
const FLAVOR_BOOKED: ReservationFlavor = {
  ...FLAVOR_H4,
  id: "f3",
  name: "ardc.h4.huge",
  description: "Largest memory",
  memory_mb: 753664,
  max_days: 7,
  rate: 4,
};

const LIMITS: ReservationLimits = {
  max_hours: 480,
  hours_used: 48,
  hours_left: 432,
  max_days: 20,
  days_used: 2,
  days_left: 18,
  max_reservations: 4,
  reservations_used: 1,
  reservations_left: 3,
  can_create: true,
};

let reservations: Reservation[] = [
  {
    id: "res-1",
    status: "ACTIVE",
    status_help: "The reservation is active: you can launch instances with it.",
    status_reason: null,
    start: `${isoDay(-1)}T00:00:00+00:00`,
    end: `${isoDay(1)}T23:59:00+00:00`,
    created_at: `${isoDay(-2)}T04:00:00+00:00`,
    instance_count: 1,
    compute_flavor: "r-f1",
    flavor: FLAVOR,
    actions: ["launch", "extend", "calendar", "delete"],
  },
];

const options: ReservationOptions = {
  limits: LIMITS,
  flavors: [FLAVOR, FLAVOR_H4],
  categories: ["GPU", "H4"],
  availability_zones: ["ardctest-artm"],
  maintenance_windows: [
    {
      id: "mw-1",
      start: `${isoDay(10)}T00:00:00+00:00`,
      end: `${isoDay(11)}T00:00:00+00:00`,
      note: "Firmware updates",
      flavors: [{ id: "f1", name: "ardc.g3.xlarge" }],
    },
  ],
  su_used: 1234.5,
  su_budget: 5000,
  today: isoDay(0),
};

const usageInstances: UsageInstancesResponse = {
  begin: "2025-10-10",
  end: "2026-10-10",
  sum: 321.5,
  items: [
    {
      id: "i-db-1",
      name: "db-1",
      rate: 200.25,
      qty: 4000,
      begin: null,
      end: null,
      display_name: "db-1",
      availability_zone: "melbourne-qh2",
      flavor_name: "m3.small",
      started_at: "2026-01-04T00:00:00+00:00",
      ended_at: null,
    },
    {
      id: "i-web-2",
      name: "web-2",
      rate: 121.25,
      qty: 2500,
      begin: null,
      end: null,
      display_name: "web-2",
      availability_zone: "melbourne-qh2",
      flavor_name: "m3.medium",
      started_at: "2026-03-01T00:00:00+00:00",
      ended_at: "2026-08-01T00:00:00+00:00",
    },
  ],
  most_used: {
    count: 2,
    items: [
      { name: "db-1", rate: 200.25 },
      { name: "web-2", rate: 121.25 },
    ],
    other: 0,
  },
  partial: false,
  errors: [],
  fetched_at: now(),
};

const allocationUsage: AllocationUsage = {
  available: true,
  allocation: data.allocation.allocation,
  su_budget: 5000,
  su_used: 1234.5,
  su_remaining: 3765.5,
  total_hours: 6500,
  today: "2026-10-09",
  day_budget: 13.74,
  on_track: 3860.9,
  budget_tracking: -2626.4,
  at_risk: false,
  cumulative: Array.from({ length: 282 }, (_, index) => {
    const date = new Date(Date.UTC(2026, 0, 1) + index * DAY_MS)
      .toISOString()
      .slice(0, 10);
    return { date, value: Math.round(index * 4.38 * 100) / 100 };
  }),
  guide: [
    { date: "2026-01-01", value: 0 },
    { date: "2026-12-31", value: 5000 },
  ],
  partial: false,
  errors: [],
  fetched_at: now(),
};

export const nectarHandlers = [
  http.patch("/api/me/profile", async ({ request }) => {
    const body = await readBody(request, profileUpdateBody);
    return HttpResponse.json<Reply<"/api/me/profile", "patch">>({
      ...data.profile,
      ...body,
    });
  }),
  http.post("/api/me/reset-password", () =>
    HttpResponse.json<Reply<"/api/me/reset-password", "post">>({
      password: "bW9ja3Bhc3N3b3JkMTIz",
      username: "researcher@example.edu",
    }),
  ),
  http.get("/api/identity/users/search", ({ request }) => {
    const q = new URL(request.url).searchParams.get("q") ?? "";
    const items =
      q.length >= 3
        ? [
            { id: "u2", displayname: "Ann Example", email: "ann@example.edu" },
            {
              id: "u3",
              displayname: "Annika Test",
              email: "annika@example.edu",
            },
          ].filter(
            (u) =>
              u.email.includes(q) ||
              u.displayname.toLowerCase().includes(q.toLowerCase()),
          )
        : [];
    return HttpResponse.json<Reply<"/api/identity/users/search", "get">>({
      items,
    });
  }),
  http.get("/api/identity/users/:userId", ({ params }) => {
    const { profile } = data;
    const user: UserDetails = {
      partial: false,
      id: String(params["userId"]),
      displayname: "Ann Example",
      first_name: "Ann",
      surname: "Example",
      email: "ann@example.edu",
      organisation: profile.organisation,
      affiliation: profile.affiliation,
      phone_number: profile.phone_number,
      mobile_number: profile.mobile_number,
      orcid: null,
      registered_at: profile.registered_at,
      last_login: profile.last_login,
      terms_accepted_at: profile.terms_accepted_at,
      expiry_status: profile.expiry_status,
      expiry_next_step: profile.expiry_next_step,
      external_ids: [
        {
          idp: "https://idp.example.edu/idp",
          last_login: "2026-10-01T02:00:00Z",
        },
      ],
      orcid_url: profile.orcid_url,
      orcid_return_url: profile.orcid_return_url,
    };
    return HttpResponse.json<Reply<"/api/identity/users/{user_id}", "get">>(
      user,
    );
  }),
  http.get("/api/identity/members", () =>
    HttpResponse.json<Reply<"/api/identity/members", "get">>({
      items: members,
      roles: [
        { id: "r-member", name: "member" },
        { id: "r-tm", name: "tenantmanager" },
      ],
    }),
  ),
  http.post("/api/identity/members", async ({ request }) => {
    const body = await readBody(request, memberAddBody);
    if (body.email.startsWith("nobody")) {
      return apiError(
        404,
        "user_not_found",
        `Unable to add user to project: there is no Nectar RC account registered for "${body.email}".`,
      );
    }
    const role = body.role_id === "r-tm" ? "tenantmanager" : "member";
    const row: MemberRow = {
      id: `u9-${body.role_id}`,
      user_id: "u9",
      name: body.email,
      role_id: body.role_id,
      role_name: role,
      is_self: false,
      can_remove: true,
    };
    members = [...members, row];
    return HttpResponse.json<Reply<"/api/identity/members", "post">>(row, {
      status: 201,
    });
  }),
  http.delete("/api/identity/members/:userId/roles/:roleId", ({ params }) => {
    members = members.filter(
      (m) =>
        !(m.user_id === params["userId"] && m.role_id === params["roleId"]),
    );
    return new HttpResponse(null, { status: 204 });
  }),
  http.get("/api/identity/application-credentials/options", () =>
    HttpResponse.json<
      Reply<"/api/identity/application-credentials/options", "get">
    >({
      roles: ["member", "tenantmanager"],
      default_expiration_date: isoDay(91),
      auth_url: "https://identity.test/v3",
      region: "Melbourne",
    }),
  ),
  http.get("/api/identity/application-credentials", () =>
    HttpResponse.json<Reply<"/api/identity/application-credentials", "get">>({
      items: appCredentials,
    }),
  ),
  http.post("/api/identity/application-credentials", async ({ request }) => {
    const body = await readBody(request, applicationCredentialCreateBody);
    if (appCredentials.some((c) => c.name === body.name)) {
      return apiError(
        409,
        "conflict",
        `Application credential name "${body.name}" is already used.`,
      );
    }
    const created: ApplicationCredential = {
      id: `ac-${appCredentials.length + 1}`,
      name: body.name,
      description: body.description ?? null,
      project_id: PROJECT_ID,
      expires_at: body.expiration_date
        ? `${body.expiration_date}T00:00:00.000000Z`
        : null,
      unrestricted: false,
      roles: body.roles.map((name) => ({
        id: `r-${name}`,
        name,
        domain_id: null,
      })),
      access_rules: [],
    };
    appCredentials = [...appCredentials, created];
    return HttpResponse.json<
      Reply<"/api/identity/application-credentials", "post">
    >({ ...created, secret: "mock-secret-value" }, { status: 201 });
  }),
  http.get("/api/identity/application-credentials/:id", ({ params }) => {
    const found = appCredentials.find((c) => c.id === params["id"]);
    return found
      ? HttpResponse.json<
          Reply<"/api/identity/application-credentials/{credential_id}", "get">
        >(found)
      : notFound();
  }),
  http.delete("/api/identity/application-credentials/:id", ({ params }) => {
    appCredentials = appCredentials.filter((c) => c.id !== params["id"]);
    return new HttpResponse(null, { status: 204 });
  }),
  http.get("/api/identity/ec2-credentials", () =>
    HttpResponse.json<Reply<"/api/identity/ec2-credentials", "get">>(ec2),
  ),
  http.post("/api/identity/ec2-credentials", () => {
    ec2 = {
      credential: {
        access: "AKIAMOCK",
        secret: "mock-ec2-secret",
        project_id: PROJECT_ID,
      },
      created: true,
    };
    return HttpResponse.json<Reply<"/api/identity/ec2-credentials", "post">>(
      ec2,
    );
  }),
  http.post("/api/identity/ec2-credentials/recreate", () => {
    ec2 = {
      credential: {
        access: "AKIAMOCK2",
        secret: "mock-ec2-secret-2",
        project_id: PROJECT_ID,
      },
      created: true,
    };
    return HttpResponse.json<
      Reply<"/api/identity/ec2-credentials/recreate", "post">
    >(ec2);
  }),
  http.delete("/api/identity/ec2-credentials/:access", () => {
    ec2 = { credential: null, created: false };
    return new HttpResponse(null, { status: 204 });
  }),
  http.get("/api/identity/credentials", () =>
    HttpResponse.json<Reply<"/api/identity/credentials", "get">>({
      items: credentials,
    }),
  ),
  http.delete("/api/identity/credentials/:id", ({ params }) => {
    credentials = credentials.filter((c) => c.id !== params["id"]);
    return new HttpResponse(null, { status: 204 });
  }),
  http.get("/api/usage/options", () =>
    HttpResponse.json<Reply<"/api/usage/options", "get">>({
      data_from: "2022-01-01",
      default_begin: isoDay(-90),
      default_end: isoDay(0),
    }),
  ),
  http.get("/api/usage/instances", ({ request }) => {
    const params = new URL(request.url).searchParams;
    return HttpResponse.json<Reply<"/api/usage/instances", "get">>({
      ...usageInstances,
      begin: params.get("begin") ?? usageInstances.begin,
      end: params.get("end") ?? usageInstances.end,
    });
  }),
  http.get("/api/usage/allocation", () =>
    HttpResponse.json<Reply<"/api/usage/allocation", "get">>(allocationUsage),
  ),
  http.get("/api/reservations", () =>
    HttpResponse.json<Reply<"/api/reservations", "get">>({
      items: reservations,
      limits: LIMITS,
    }),
  ),
  http.get("/api/reservations/options", () =>
    HttpResponse.json<Reply<"/api/reservations/options", "get">>(options),
  ),
  http.get("/api/reservations/slots", ({ request }) => {
    const params = new URL(request.url).searchParams;
    const category = params.get("category");
    // The backend searches up to the requested end, within 730 days.
    const horizon = isoDay(730);
    const requestedEnd = params.get("end") ?? isoDay(90);
    const flavors = [
      FLAVOR,
      FLAVOR_H4,
      ...(category === "H4" ? [FLAVOR_BOOKED] : []),
    ].filter((flavor) => !category || flavor.category === category);
    const slots = [
      {
        flavor_id: "f1",
        start: `${isoDay(0)}T00:00:00+00:00`,
        end: `${isoDay(30)}T00:00:00+00:00`,
        first_day: isoDay(0),
        last_day: isoDay(29),
      },
      {
        flavor_id: "f2",
        start: `${isoDay(5)}T00:00:00+00:00`,
        end: `${isoDay(60)}T00:00:00+00:00`,
        first_day: isoDay(5),
        last_day: isoDay(59),
      },
    ].filter((slot) => flavors.some((flavor) => flavor.id === slot.flavor_id));
    return HttpResponse.json<Reply<"/api/reservations/slots", "get">>({
      start: isoDay(0),
      end: requestedEnd < horizon ? requestedEnd : horizon,
      flavors,
      slots,
    });
  }),
  http.post("/api/reservations", async ({ request }) => {
    const body = await readBody(request, reservationCreateBody);
    const created: Reservation = {
      id: `res-${reservations.length + 1}`,
      status: "PENDING_CREATE",
      status_help: "The reservation is being created and may still fail.",
      status_reason: null,
      start: `${body.start}T00:00:00+00:00`,
      end: `${body.end}T23:59:00+00:00`,
      created_at: new Date().toISOString(),
      instance_count: 1,
      compute_flavor: null,
      flavor: FLAVOR,
      actions: [],
    };
    reservations = [...reservations, created];
    setTimeout(() => {
      reservations = reservations.map((r) =>
        r.id === created.id
          ? {
              ...r,
              status: "ALLOCATED",
              compute_flavor: "r-f2",
              actions: ["calendar", "delete"],
            }
          : r,
      );
    }, 1500);
    return HttpResponse.json<Reply<"/api/reservations", "post">>(created, {
      status: 201,
    });
  }),
  http.get("/api/reservations/:id/extend-options", () =>
    HttpResponse.json<
      Reply<"/api/reservations/{reservation_id}/extend-options", "get">
    >({
      available: true,
      eligible_days: 5,
      min_end: isoDay(2),
      max_end: isoDay(6),
    }),
  ),
  http.post("/api/reservations/:id/extend", async ({ params, request }) => {
    const body = await readBody(request, reservationExtendBody);
    reservations = reservations.map((r) =>
      r.id === params["id"] ? { ...r, end: `${body.end}T23:59:00+00:00` } : r,
    );
    return HttpResponse.json<
      Reply<"/api/reservations/{reservation_id}/extend", "post">
    >(reservations.find((r) => r.id === params["id"]));
  }),
  http.get(
    "/api/reservations/:id/calendar.ics",
    ({ params }) =>
      new HttpResponse(
        `BEGIN:VCALENDAR\r\nPRODID:mock\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:nectar-reservation-${String(params["id"])}@mock\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n`,
        { headers: { "Content-Type": "text/calendar; charset=utf-8" } },
      ),
  ),
  http.get("/api/reservations/:id", ({ params }) => {
    const found = reservations.find((r) => r.id === params["id"]);
    return found
      ? HttpResponse.json<Reply<"/api/reservations/{reservation_id}", "get">>({
          ...found,
          calendar: {
            google:
              "https://calendar.google.com/calendar/render?action=TEMPLATE",
            outlook: "https://outlook.office.com/calendar/0/deeplink/compose",
            outlook_personal:
              "https://outlook.live.com/calendar/0/deeplink/compose",
          },
          detail_url: `http://localhost:4173/reservations/${found.id}`,
        })
      : notFound();
  }),
  http.delete("/api/reservations/:id", ({ params }) => {
    reservations = reservations.filter((r) => r.id !== params["id"]);
    return new HttpResponse(null, { status: 204 });
  }),
];
