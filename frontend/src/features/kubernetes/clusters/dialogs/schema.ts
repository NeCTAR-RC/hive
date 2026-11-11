// The node label and taint fields that the create and labels dialogs share.
import { z } from "zod";
import { LABELS_PATTERN, TAINTS_PATTERN } from "../../status";

/** Kubernetes node labels as `key=value` pairs; empty is allowed. */
export const labelsField = z
  .string()
  .trim()
  .refine(
    (v) => !v || LABELS_PATTERN.test(v),
    "Use key=value pairs separated by commas",
  );

/** Kubernetes node taints as `key=value:Effect` pairs; empty is allowed. */
export const taintsField = z
  .string()
  .trim()
  .refine(
    (v) => !v || TAINTS_PATTERN.test(v),
    "Use key=value:Effect pairs separated by commas, with NoSchedule, PreferNoSchedule or NoExecute",
  );
