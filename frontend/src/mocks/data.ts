// Fixture data for the mocked API (VITE_MOCK=1), shared by Vitest, the
// Playwright suite and local UI work without a backend.
import type {
  AllocationSummary,
  Me,
  NewsResponse,
  OutagesResponse,
  Profile,
  PublicConfig,
  RisksResponse,
  SessionProbe,
  UsageSummary,
} from "../lib/api/types";

const now = () => Date.now() / 1000;

export const config: PublicConfig = {
  site_name: "Nectar Dashboard",
  env: "test",
  version: "0.0.0-mock",
  login_url:
    "https://accounts.test.rc.nectar.org.au/login?return-path=http%3A%2F%2Flocalhost%3A4173%2Fauth%2Fwebsso%2F",
  login_url_nz: null,
  login_base_url: "https://accounts.test.rc.nectar.org.au/login",
  login_base_url_nz:
    "https://accounts.test.rc.nectar.org.au/Shibboleth.sso/DS-Tuakiri?return-path=/login/",
  receiver_url: "http://localhost:4173/auth/websso/",
  horizon_url: "https://dashboard.rctest.nectar.org.au",
  help_url: "https://support.ehelp.edu.au/support/home",
  outage_base_url: "https://status.rctest.nectar.org.au/outages/",
  ga_id: null,
  freshworks_widget_id: null,
  banner_url: null,
  trial_project_prefix: "pt-",
};

export const session = (): SessionProbe => ({
  authenticated: true,
  user_id: "u1",
  project_id: "p1",
  expires_at: now() + 6 * 3600,
  server_time: now(),
  csrf_token: "mock-csrf",
});

export const me = (): Me => ({
  user: { id: "u1", name: "researcher@example.edu", domain_id: "default" },
  project: {
    id: "p1",
    name: "research-project",
    domain_id: "default",
    enabled: true,
    is_trial: false,
  },
  roles: ["member", "tenantmanager"],
  projects: [
    { id: "p1", name: "research-project", domain_id: "default", enabled: true },
    { id: "p2", name: "pt-1234", domain_id: "default", enabled: true },
  ],
  capabilities: {
    tenantmanager: true,
    user_lookup: false,
    services: {
      compute: true,
      volume: true,
      network: true,
      image: true,
      "object-store": true,
      "container-infra": true,
      "load-balancer": true,
      orchestration: true,
      dns: true,
      share: true,
      database: true,
      reservation: true,
      security: true,
      rating: true,
      metric: true,
      allocations: true,
      account: true,
      ops: true,
    },
  },
  session: { expires_at: now() + 6 * 3600, server_time: now() },
});

export const profile: Profile = {
  partial: false,
  id: 1,
  first_name: "Ada",
  surname: "Lovelace",
  displayname: "Ada Lovelace",
  email: "ada@example.edu",
  affiliation: "staff",
  phone_number: null,
  mobile_number: "0400 000 000",
  orcid: "0000-0002-1825-0097",
  organisation: "Example University",
  registered_at: "2024-02-01T00:00:00Z",
  last_login: "2026-10-09T01:00:00Z",
  terms_accepted_at: "2024-02-01T00:00:00Z",
  expiry_status: null,
  expiry_next_step: null,
  external_ids: [
    {
      idp: "https://idp.example.edu/idp/shibboleth",
      last_login: "2026-10-09T01:00:00Z",
    },
  ],
  affiliations: [
    { id: "faculty", label: "Faculty" },
    { id: "student", label: "Student" },
    { id: "staff", label: "Staff" },
    { id: "employee", label: "Employee" },
    { id: "member", label: "Member" },
    { id: "affiliate", label: "Affiliate" },
    { id: "alum", label: "Alumnus" },
    { id: "library-walk-in", label: "Library walk-in" },
  ],
  orcid_url: "https://sandbox.orcid.org",
  orcid_link_url:
    "https://sandbox.orcid.org/oauth/authorize?client_id=mock&redirect_uri=https://accounts.test/orcid/link/?next=http%3A%2F%2Flocalhost%3A4173%2Faccount%2Fmy-details",
  orcid_unlink_url: "https://accounts.test/orcid/unlink/",
  orcid_return_url: "http://localhost:4173/account/my-details",
};

export const outages: OutagesResponse = {
  available: true,
  fetched_at: now(),
  items: [
    {
      id: 1,
      title: "Storage maintenance in Melbourne",
      description: "Volumes may be briefly unavailable.",
      severity: 2,
      scheduled: true,
      scheduled_display: "scheduled",
      status_display: "In progress",
      start: "2026-10-09T01:00:00Z",
      end: null,
      planned_end: "2026-10-09T05:00:00Z",
      cancelled: false,
      url: "https://status.rctest.nectar.org.au/outages/1/",
    },
  ],
};

export const allocation: AllocationSummary = {
  allocation: {
    id: 42,
    project_id: "p1",
    project_name: "research-project",
    project_description: "Research project",
    status: "A",
    status_display: "Approved",
    start_date: "2026-01-01",
    end_date: "2026-12-31",
    bundle: "Silver",
    allocation_home_display: "National",
    national: true,
    managed: true,
  },
  su_budget: 5000,
  su_used: 1234.5,
  quotas: { "rating.budget": { quota: 5000, zone: "nectar" } },
  is_trial: false,
  links: {
    new_request: "https://dashboard.rctest.nectar.org.au/allocation/request/",
    my_requests:
      "https://dashboard.rctest.nectar.org.au/allocation/user_requests/",
  },
  partial: false,
  errors: [],
  fetched_at: now(),
};

export const usage: UsageSummary = {
  begin: "2026-07-11",
  end: "2026-10-09",
  sum: 321.5,
  data: [],
  fetched_at: now(),
};

const DAY_MS = 86_400_000;

// Ninety days ending 9 Oct 2026 at 3.5 SU a day, with one busy day, so the
// total matches `usage.sum` (89 x 3.5 + 10 = 321.5).
export const usageDaily: UsageSummary = {
  ...usage,
  begin: "2026-07-12",
  data: Array.from({ length: 90 }, (_, index) => {
    const begin = Date.UTC(2026, 9, 9) - (89 - index) * DAY_MS;
    return {
      begin: new Date(begin).toISOString(),
      end: new Date(begin + DAY_MS).toISOString(),
      qty: 24,
      rate: index === 60 ? 10 : 3.5,
    };
  }),
};

export const risks: RisksResponse = {
  items: [
    {
      id: "risk-1",
      resource_id: "i-db-1",
      resource_type: "instance",
      status: "NEW",
      ipaddress: "203.0.113.10",
      port: 3306,
      type: {
        id: "t-db",
        name: "accessible-db",
        display_name: null,
        description:
          "Database service exposed to the Internet which could be a misconfiguration",
        help_url:
          "https://support.ehelp.edu.au/support/solutions/articles/6000277030#Accessible-DB",
      },
      first_seen: "2026-10-01T00:00:00+00:00",
      last_seen: "2026-10-09T00:00:00+00:00",
    },
  ],
  available: true,
  fetched_at: now(),
};

export const news: NewsResponse = {
  fetched_at: now(),
  items: [
    {
      title: "ARDC news item one",
      link: "https://ardc.edu.au/article/one/",
      published: "2026-10-06T02:47:09Z",
      summary: "The first mocked news item.",
      image: null,
    },
    {
      title: "ARDC news item two",
      link: "https://ardc.edu.au/article/two/",
      published: "2026-09-28T01:29:24Z",
      summary: "The second mocked news item.",
      image: null,
    },
  ],
};
