// Pure rules of the share dialogs: the create request, its size check
// against the quota, and the key=value text the metadata fields edit.
import type { ShareCreateRequest } from "../../../lib/api/types/shares";
import { quotaLeft, quotaPair, type Limits } from "../../../lib/quota";

/** The hint under every metadata field. */
export const METADATA_HINT = "One key=value pair per line.";

/** The create share form's values, as its schema parses them. */
export interface CreateShareValues {
  name: string;
  description: string;
  protocol: string;
  size: number;
  share_type: string;
  availability_zone: string;
  share_group_id: string;
  snapshot_id: string;
  metadata: string;
  is_public: boolean;
}

/**
 * The create share request: the name, protocol, size, type and visibility
 * always, and each optional field only when it was filled in (the metadata
 * only when it holds more than blank space).
 */
export function createShareBody(values: CreateShareValues): ShareCreateRequest {
  return {
    name: values.name,
    protocol: values.protocol,
    size: values.size,
    share_type: values.share_type,
    is_public: values.is_public,
    ...(values.description ? { description: values.description } : {}),
    ...(values.availability_zone
      ? { availability_zone: values.availability_zone }
      : {}),
    ...(values.share_group_id ? { share_group_id: values.share_group_id } : {}),
    ...(values.snapshot_id ? { snapshot_id: values.snapshot_id } : {}),
    ...(values.metadata.trim() ? { metadata: values.metadata } : {}),
  };
}

/**
 * The share storage left in the quota, in GiB, from Manila's absolute
 * limits; null when the quota is unlimited.
 */
export function storageLeft(quota: Limits | undefined): number | null {
  return quotaLeft(
    quotaPair(quota, "maxTotalShareGigabytes", "totalShareGigabytesUsed"),
  );
}

/**
 * Why a new share of `size` GiB does not fit the `left` GiB of quota, or
 * null when it does (or the quota is unlimited). Manila refuses an
 * oversize share; the dialog says so before the request, as the volume
 * dialogs do.
 */
export function shareSizeError(size: number, left: number | null) {
  return left !== null && size > left
    ? `A ${size} GiB share cannot be created: ${left} GiB of your quota is left`
    : null;
}

/** A share's metadata as the metadata field edits it: one key=value per line. */
export function formatMetadata(metadata: Record<string, string>): string {
  return Object.entries(metadata)
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
}
