// The launch wizard's warning when the project has no room for another
// instance at all.
import { Alert } from "@ardc-ui/react";
import type { LaunchOptions } from "../../../lib/api/types/compute";
import { instanceQuotaProblem } from "./launch";

/**
 * Warns up front when the project cannot launch even one more instance
 * under its instance quota. A count over the quota is the Count field's
 * own error, which stops Next and Launch. Nothing shows while the options
 * load or when the quota is unlimited.
 */
export function LaunchQuotaWarning({
  data,
}: {
  data: LaunchOptions | undefined;
}) {
  const problem = instanceQuotaProblem(data?.limits, 1);
  if (!problem) return null;
  return (
    <Alert tone="warning" role="status">
      {problem}
    </Alert>
  );
}
