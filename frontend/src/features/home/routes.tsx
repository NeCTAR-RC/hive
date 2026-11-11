import { createRoute } from "@tanstack/react-router";
import { appLayoutRoute } from "../../app/layouts";
import { HomePage } from "./HomePage";

/** The home page loads with the app: it is where a login lands. */
const homeRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/",
  component: HomePage,
});

/** The dashboard's home page. */
export const homeRoutes = [homeRoute];
