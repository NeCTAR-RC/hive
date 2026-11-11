import { setupWorker } from "msw/browser";
import type { MockedReply } from "./contractWorker";
import { handlers } from "./handlers";
import { apiError } from "./http";
import { WAKE_PATH, wakeHandler, wakeMocks } from "./wake";

const worker = setupWorker(...handlers, wakeHandler);

/**
 * Every mocked /api reply is checked against the backend's contract, in a
 * worker (contractWorker.ts); one that breaks it is logged as a "[mock]"
 * error, which the e2e fixture turns into a test failure, so a mock cannot
 * drift from the backend on a route the specs exercise.
 */
const contractCheck = new Worker(
  new URL("./contractWorker.ts", import.meta.url),
  { type: "module" },
);
contractCheck.onmessage = ({ data }: MessageEvent<string[]>) => {
  for (const problem of data) {
    console.error(`[mock] reply breaks the contract: ${problem}`);
  }
};

worker.events.on("response:mocked", ({ request, response }) => {
  const { pathname } = new URL(request.url);
  if (!pathname.startsWith("/api/")) return;
  void response
    .clone()
    .text()
    .then((text) => {
      const reply: MockedReply = {
        method: request.method,
        pathname,
        status: response.status,
        text,
        contentType: response.headers.get("content-type"),
      };
      contractCheck.postMessage(reply);
    });
});

/** The request behind an intercepted network frame, when it is HTTP. */
function frameRequest(data: unknown): Request | null {
  return typeof data === "object" &&
    data !== null &&
    "request" in data &&
    data.request instanceof Request
    ? data.request
    : null;
}

/** Starts the worker, answering an unmocked /api request as below. */
function startWorker() {
  return worker.start({
    quiet: true,
    onUnhandledFrame: ({ frame, defaults }) => {
      const request = frameRequest(frame.data);
      if (!request) return;
      const path = new URL(request.url).pathname;
      if (!path.startsWith("/api/")) return;
      defaults.error();
      // MSW answers a frame with a thrown Response.
      throw apiError(
        501,
        "not_mocked",
        `no mocked handler for ${request.method} ${path}`,
      );
    },
  });
}

/**
 * Starts the in-browser mocked API. An /api request with no handler is
 * answered with a 501 in the backend's envelope and logged as an "[MSW]"
 * error, which the e2e fixture turns into a test failure, so a new endpoint
 * without a mock is caught at once. Every other request (assets, fonts,
 * third-party hosts) passes through. Whenever the tab is shown again, the
 * mocking restarts if Chrome stopped the idle worker meanwhile (wake.ts).
 */
export async function startMockApi(): Promise<void> {
  await startWorker();
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    void wakeMocks({
      probe: () => fetch(WAKE_PATH, { cache: "no-store" }),
      restart: async () => {
        await worker.stop();
        await startWorker();
      },
    }).then((restarted) => {
      if (restarted) console.info("[mock] restarted the mocked API");
    });
  });
}
