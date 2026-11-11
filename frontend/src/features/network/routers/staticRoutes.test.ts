import { describe, expect, it } from "vitest";
import { routerRoutesBody } from "../../../mocks/network/schemas";
import { routeId, withRoute, withoutRoutes } from "./staticRoutes";

const office = { destination: "10.9.0.0/16", nexthop: "10.0.0.9" };
const lab = { destination: "10.8.0.0/16", nexthop: "10.0.0.8" };
const labViaOther = { destination: "10.8.0.0/16", nexthop: "10.0.0.7" };

describe("routeId", () => {
  it("tells routes apart by destination and next hop", () => {
    expect(routeId(lab)).toBe("10.8.0.0/16|10.0.0.8");
    expect(routeId(lab)).not.toBe(routeId(labViaOther));
  });
});

describe("withRoute", () => {
  it("puts the new route before the existing ones", () => {
    const routes = withRoute([office], lab);
    expect(routes).toEqual([lab, office]);
    expect(routerRoutesBody.parse({ routes })).toEqual({ routes });
  });
});

describe("withoutRoutes", () => {
  it.each([
    {
      name: "keeps the routes not removed",
      removed: [lab],
      remaining: [office, labViaOther],
    },
    {
      name: "keeps a route to the same destination by another hop",
      removed: [labViaOther],
      remaining: [office, lab],
    },
    {
      name: "can remove every route",
      removed: [office, lab, labViaOther],
      remaining: [],
    },
  ])("$name", ({ removed, remaining }) => {
    expect(withoutRoutes([office, lab, labViaOther], removed)).toEqual(
      remaining,
    );
  });
});
