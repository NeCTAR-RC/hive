// The create cluster form: its schema and the request body it sends.
import { z } from "zod";
import type {
  ClusterCreateRequest,
  ClusterFlavor,
} from "../../../lib/api/types/kubernetes";
import type { Limits } from "../../../lib/quota";
import { maxLength } from "../../../lib/validation";
import { clusterNeeds, clusterQuotaProblem } from "./quota";

/** The create cluster form's fields, before the rules that read the options. */
const clusterFields = z.object({
  name: maxLength(255)
    .min(1, "Enter a cluster name")
    .regex(
      /^[a-zA-Z][a-zA-Z0-9_\-.]*$/,
      "Start with a letter; use letters, numbers, dots, dashes and underscores",
    ),
  kubernetes_version: z.string().min(1, "Choose a Kubernetes version"),
  availability_zone: z.string().min(1, "Choose an availability zone"),
  network_driver: z.string().min(1, "Choose a network driver"),
  master_count: z.string().min(1, "Choose the control plane size"),
  master_flavor_id: z.string().min(1, "Choose a control plane flavour"),
  node_count: z.number().int().min(0, "At least 0"),
  flavor_id: z.string().min(1, "Choose a worker flavour"),
  keypair: z.string(),
  autoscaling: z.boolean(),
  min_node_count: z.number().int().min(0, "At least 0").optional(),
  max_node_count: z.number().int().min(1, "At least 1").optional(),
  etcd_volume: z.boolean(),
  etcd_volume_size: z.number().int().min(1).optional(),
  etcd_volume_type: z.string(),
});

export type ClusterFormValues = z.infer<typeof clusterFields>;

/** What the rules read beside the form: the flavours and compute limits. */
export interface ClusterContext {
  flavors: readonly ClusterFlavor[];
  limits: Limits | undefined;
}

/**
 * The create cluster schema: the fields, the etcd volume's size once it is
 * on, autoscaling bounds that hold the worker count (as Magnum's node group
 * rule asks), and a cluster the compute quota can hold, reported under the
 * worker count since that is what users raise.
 */
export function clusterSchema({ flavors, limits }: ClusterContext) {
  return clusterFields.superRefine((values, ctx) => {
    if (values.etcd_volume && !values.etcd_volume_size) {
      ctx.addIssue({
        code: "custom",
        path: ["etcd_volume_size"],
        message: "Enter the volume size in GB",
      });
    }
    if (values.autoscaling) {
      const { min_node_count: min, max_node_count: max } = values;
      if (min === undefined) {
        ctx.addIssue({
          code: "custom",
          path: ["min_node_count"],
          message: "Enter the fewest workers",
        });
      }
      if (max === undefined) {
        ctx.addIssue({
          code: "custom",
          path: ["max_node_count"],
          message: "Enter the most workers",
        });
      } else if (min !== undefined && max < min) {
        ctx.addIssue({
          code: "custom",
          path: ["max_node_count"],
          message: "At least the fewest workers",
        });
      } else if (
        min !== undefined &&
        (values.node_count < min || values.node_count > max)
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["node_count"],
          message: `Between ${min} and ${max} while autoscaling`,
        });
      }
    }
    const quota = clusterQuotaProblem(clusterNeeds(values, flavors), limits);
    if (quota) {
      ctx.addIssue({ code: "custom", path: ["node_count"], message: quota });
    }
  });
}

/**
 * The create request for the picked template. The key pair goes only when
 * one is chosen, the autoscaling bounds only while autoscaling is on, the
 * etcd volume only when it is switched on with a size, and its type only
 * when one is given; the version, zone and driver travel in the template,
 * not the body.
 */
export function clusterCreateRequest(
  values: ClusterFormValues,
  templateId: string,
): ClusterCreateRequest {
  return {
    name: values.name,
    cluster_template_id: templateId,
    master_count: Number(values.master_count),
    master_flavor_id: values.master_flavor_id,
    node_count: values.node_count,
    flavor_id: values.flavor_id,
    ...(values.keypair ? { keypair: values.keypair } : {}),
    ...(values.autoscaling
      ? {
          autoscaling: true,
          ...(values.min_node_count !== undefined
            ? { min_node_count: values.min_node_count }
            : {}),
          ...(values.max_node_count !== undefined
            ? { max_node_count: values.max_node_count }
            : {}),
        }
      : {}),
    ...(values.etcd_volume && values.etcd_volume_size
      ? {
          etcd_volume_size: values.etcd_volume_size,
          ...(values.etcd_volume_type
            ? { etcd_volume_type: values.etcd_volume_type }
            : {}),
        }
      : {}),
  };
}
