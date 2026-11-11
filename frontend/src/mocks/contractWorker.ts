// Checks mocked replies against the contract (contract.ts) in a worker, off
// the page's main thread: compiling a schema and validating a large reply
// would otherwise compete with the page's rendering and slow the e2e specs.
import { replyBody, replyProblems } from "./contract";

/** One mocked reply, as the mock worker hands it over. */
export interface MockedReply {
  method: string;
  pathname: string;
  status: number;
  text: string;
  contentType: string | null;
}

/** The worker's side of the channel; the app's DOM typings lack it. */
const scope = globalThis as unknown as {
  onmessage: ((event: MessageEvent<MockedReply>) => void) | null;
  postMessage: (problems: string[]) => void;
};

/** Answers a reply that breaks the contract with its problems. */
scope.onmessage = ({ data }) => {
  const body = replyBody(data.text, data.contentType);
  const problems = replyProblems(data.method, data.pathname, data.status, body);
  if (problems.length) scope.postMessage(problems);
};
