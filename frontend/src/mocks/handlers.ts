// Every mocked API handler (VITE_MOCK=1), one module per domain. The
// browser worker (browser.ts) serves these in the Playwright suite and for
// local UI work without a backend.
import { computeHandlers } from "./compute/handlers";
import { coreHandlers } from "./core/handlers";
import { databaseHandlers } from "./databases/handlers";
import { dnsHandlers } from "./dns/handlers";
import { faultHandler } from "./faults";
import { kubernetesHandlers } from "./kubernetes/handlers";
import { loadBalancerHandlers } from "./loadbalancers/handlers";
import { nectarHandlers } from "./nectar/handlers";
import { networkHandlers } from "./network/handlers";
import { objectStoreHandlers } from "./objectstore/handlers";
import { orchestrationHandlers } from "./orchestration/handlers";
import { shareHandlers } from "./shares/handlers";
import { volumeHandlers } from "./volumes/handlers";

export const handlers = [
  // Falls through to the real handlers unless a failure was asked for.
  faultHandler,
  ...coreHandlers,
  ...computeHandlers,
  ...networkHandlers,
  ...volumeHandlers,
  ...nectarHandlers,
  ...objectStoreHandlers,
  ...kubernetesHandlers,
  ...loadBalancerHandlers,
  ...orchestrationHandlers,
  ...dnsHandlers,
  ...shareHandlers,
  ...databaseHandlers,
];
