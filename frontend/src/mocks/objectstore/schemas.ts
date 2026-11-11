// The request bodies the mocked object store endpoints accept, each tied to
// the frontend's request type so the two cannot drift apart unnoticed.
import { z } from "zod";
import type {
  ContainerCreateRequest,
  CopyObjectRequest,
} from "../../lib/api/types/objectstore";

export const containerCreateBody = z.object({
  name: z.string().min(1),
  is_public: z.boolean(),
  storage_policy: z.string().optional(),
}) satisfies z.ZodType<ContainerCreateRequest>;

export const containerUpdateBody = z.object({
  is_public: z.boolean().optional(),
  metadata: z.record(z.string(), z.string()).optional(),
});

export const folderCreateBody = z.object({ path: z.string().min(1) });

export const uploadPlanBody = z.object({
  objects: z.array(
    z.object({
      name: z.string().min(1),
      size: z.number().int().min(0),
      content_type: z.string().nullable(),
    }),
  ),
});

export const deleteObjectsBody = z.object({ names: z.array(z.string()) });

export const copyObjectBody = z.object({
  dest_container: z.string().min(1),
  dest_name: z.string().min(1),
}) satisfies z.ZodType<CopyObjectRequest>;
