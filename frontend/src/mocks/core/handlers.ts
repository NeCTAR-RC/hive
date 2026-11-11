// Mocked API for the session-wide endpoints: config, session, me, the
// home page feeds, project switching and logout.
import { http, HttpResponse } from "msw";
import * as data from "./fixtures";
import { switchProjectBody } from "./schemas";
import { apiError, notFound, readBody, type Reply } from "../http";

// A `hive_mock=anon` cookie makes the mocked API behave as logged out.
function anonymous(cookies: Record<string, string>): boolean {
  return cookies["hive_mock"] === "anon";
}

// A `hive_mock=me_down` cookie makes /api/me fail, as when Keystone is down.
function meDown(cookies: Record<string, string>): boolean {
  return cookies["hive_mock"] === "me_down";
}

// A `hive_mock=helpdesk` cookie gives the user the user lookup capability.
function helpdesk(cookies: Record<string, string>): boolean {
  return cookies["hive_mock"] === "helpdesk";
}

export const coreHandlers = [
  http.get("/api/config", () =>
    HttpResponse.json<Reply<"/api/config", "get">>(data.config),
  ),
  http.get("/api/session", ({ cookies }) =>
    anonymous(cookies)
      ? HttpResponse.json<Reply<"/api/session", "get">>({
          authenticated: false,
          login_url: data.config.login_url,
          server_time: Date.now() / 1000,
        })
      : HttpResponse.json<Reply<"/api/session", "get">>(data.session()),
  ),
  http.get("/api/me", ({ cookies }) => {
    if (anonymous(cookies)) {
      return apiError(401, "not_authenticated", "login required");
    }
    if (meDown(cookies)) {
      return apiError(
        503,
        "upstream_unavailable",
        "identity is down",
        "keystone",
      );
    }
    const me = data.me();
    if (helpdesk(cookies)) me.capabilities.user_lookup = true;
    return HttpResponse.json<Reply<"/api/me", "get">>(me);
  }),
  http.get("/api/projects", ({ cookies }) => {
    if (anonymous(cookies)) {
      return apiError(401, "not_authenticated", "login required");
    }
    const { projects, project } = data.me();
    return HttpResponse.json<Reply<"/api/projects", "get">>({
      items: projects,
      current_project_id: project.id,
    });
  }),
  http.get("/api/me/profile", () =>
    HttpResponse.json<Reply<"/api/me/profile", "get">>(data.profile),
  ),
  http.get("/api/outages", () =>
    HttpResponse.json<Reply<"/api/outages", "get">>(data.outages),
  ),
  http.get("/api/allocation/summary", () =>
    HttpResponse.json<Reply<"/api/allocation/summary", "get">>(data.allocation),
  ),
  http.get("/api/usage/summary", ({ request }) =>
    HttpResponse.json<Reply<"/api/usage/summary", "get">>(
      new URL(request.url).searchParams.get("groupby") === "time-1d"
        ? data.usageDaily
        : data.usage,
    ),
  ),
  http.get("/api/security/risks", () =>
    HttpResponse.json<Reply<"/api/security/risks", "get">>(data.risks),
  ),
  http.get("/api/news/ardc", () =>
    HttpResponse.json<Reply<"/api/news/ardc", "get">>(data.news),
  ),
  http.get("/mock/featured-banner.json", () => HttpResponse.json(data.banner)),
  http.post("/api/session/project", async ({ request }) => {
    const body = await readBody(request, switchProjectBody);
    const next = data.me();
    const project = next.projects.find((p) => p.id === body.project_id);
    if (!project) {
      return notFound("project is not available");
    }
    next.project = { ...project, is_trial: project.name.startsWith("pt-") };
    return HttpResponse.json<Reply<"/api/session/project", "post">>(next);
  }),
  // Signing out leaves the mocked API logged out (MSW applies the cookie to
  // the page), as the backend's session ends.
  http.post(
    "/api/auth/logout",
    () =>
      new HttpResponse(null, {
        status: 204,
        headers: { "Set-Cookie": "hive_mock=anon; Path=/" },
      }),
  ),
];
