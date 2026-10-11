import { http, HttpResponse } from "msw";
import { computeHandlers } from "./compute";
import { m5Handlers } from "./m5";
import { m6Handlers } from "./m6";
import { nectarHandlers } from "./nectar";
import { networkHandlers } from "./network";
import { volumeHandlers } from "./volumes";
import * as data from "./data";

// A `hive_mock=anon` cookie makes the mocked API behave as logged out.
function anonymous(cookies: Record<string, string>): boolean {
  return cookies["hive_mock"] === "anon";
}

export const handlers = [
  http.get("/api/config", () => HttpResponse.json(data.config)),
  http.get("/api/session", ({ cookies }) =>
    anonymous(cookies)
      ? HttpResponse.json({
          authenticated: false,
          login_url: data.config.login_url,
          server_time: Date.now() / 1000,
        })
      : HttpResponse.json(data.session()),
  ),
  http.get("/api/me", ({ cookies }) =>
    anonymous(cookies)
      ? HttpResponse.json(
          { error: "not_authenticated", message: "login required" },
          { status: 401 },
        )
      : HttpResponse.json(data.me()),
  ),
  http.get("/api/me/profile", () => HttpResponse.json(data.profile)),
  http.get("/api/outages", () => HttpResponse.json(data.outages)),
  http.get("/api/allocation/summary", () => HttpResponse.json(data.allocation)),
  http.get("/api/usage/summary", ({ request }) =>
    HttpResponse.json(
      new URL(request.url).searchParams.get("groupby") === "time-1d"
        ? data.usageDaily
        : data.usage,
    ),
  ),
  http.get("/api/security/risks", () => HttpResponse.json(data.risks)),
  http.get("/api/news/ardc", () => HttpResponse.json(data.news)),
  http.post("/api/session/project", async ({ request }) => {
    const body = (await request.json()) as { project_id: string };
    const next = data.me();
    const project = next.projects.find((p) => p.id === body.project_id);
    if (!project) {
      return HttpResponse.json(
        { error: "not_found", message: "project is not available" },
        { status: 404 },
      );
    }
    next.project = { ...project, is_trial: project.name.startsWith("pt-") };
    return HttpResponse.json(next);
  }),
  http.post("/api/auth/logout", () => new HttpResponse(null, { status: 204 })),
  ...computeHandlers,
  ...networkHandlers,
  ...volumeHandlers,
  ...nectarHandlers,
  ...m5Handlers,
  ...m6Handlers,
];
