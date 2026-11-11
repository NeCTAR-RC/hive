// The request bodies the mocked Kubernetes endpoints accept, each tied to the
// frontend's request type so the two cannot drift apart unnoticed.
import { z } from "zod";
import type {
  ClusterCreateRequest,
  NodeGroupCreateRequest,
} from "../../lib/api/types/kubernetes";

const count = z.number().int().min(0);

export const clusterCreateBody = z.object({
  name: z.string().min(1),
  cluster_template_id: z.string().min(1),
  master_count: count,
  master_flavor_id: z.string().min(1),
  node_count: count,
  flavor_id: z.string().min(1),
  etcd_volume_size: z.number().int().optional(),
  etcd_volume_type: z.string().optional(),
  keypair: z.string().min(1).optional(),
  autoscaling: z.boolean().optional(),
  min_node_count: count.optional(),
  max_node_count: count.optional(),
}) satisfies z.ZodType<ClusterCreateRequest>;

export const nodeGroupCreateBody = z.object({
  name: z.string().min(1),
  flavor_id: z.string().min(1),
  node_count: count,
  autoscaling: z.boolean(),
  min_node_count: count.optional(),
  max_node_count: count.optional(),
  boot_volume_size: z.number().int().optional(),
  boot_volume_type: z.string().optional(),
  node_labels: z.string().optional(),
  node_taints: z.string().optional(),
}) satisfies z.ZodType<NodeGroupCreateRequest>;

export const nodeGroupResizeBody = z.object({ node_count: count });
