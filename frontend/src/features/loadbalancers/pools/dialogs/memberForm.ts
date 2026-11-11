// The member forms (octavia-dashboard members step): the add and edit
// fields, and the request bodies the values become.
import { z } from "zod";
import type {
  MemberSpec,
  MemberUpdate,
} from "../../../../lib/api/types/loadbalancers";
import { maxLength } from "../../../../lib/validation";
import {
  enteredPort,
  memberFields,
  optionalIpAddress,
  refineMember,
  type SubnetRange,
} from "../../schemas";

const monitorPort = z.number().int().min(1).max(65535).optional();

/**
 * The add dialog's schema for the offered `subnets`: the member fields the
 * wizard asks for, checked by the same rule, plus the monitor address and
 * port and the admin state.
 */
export function addMemberSchema(subnets: readonly SubnetRange[]) {
  return z
    .object({
      ...memberFields,
      monitor_address: optionalIpAddress,
      monitor_port: monitorPort,
      admin_state_up: z.boolean(),
    })
    .superRefine((v, ctx) => refineMember(v, subnets, ctx));
}

export type AddMemberValues = z.infer<ReturnType<typeof addMemberSchema>>;

/** The edit dialog's fields; the address and port are fixed. */
export const editMemberSchema = z.object({
  name: maxLength(255),
  weight: memberFields.weight,
  monitor_address: optionalIpAddress,
  monitor_port: monitorPort,
  backup: z.boolean(),
  admin_state_up: z.boolean(),
});

export type EditMemberValues = z.infer<typeof editMemberSchema>;

/** The add body: the name, subnet and monitor address and port only when set. */
export function addMemberBody(v: AddMemberValues): MemberSpec {
  return {
    address: v.address,
    protocol_port: enteredPort(v.protocol_port),
    weight: v.weight,
    backup: v.backup,
    admin_state_up: v.admin_state_up,
    ...(v.name ? { name: v.name } : {}),
    ...(v.subnet_id ? { subnet_id: v.subnet_id } : {}),
    ...(v.monitor_address ? { monitor_address: v.monitor_address } : {}),
    ...(v.monitor_port ? { monitor_port: v.monitor_port } : {}),
  };
}

/** The update body: every editable field. */
export function editMemberBody(v: EditMemberValues): MemberUpdate {
  return {
    name: v.name,
    weight: v.weight,
    backup: v.backup,
    admin_state_up: v.admin_state_up,
    // An emptied field clears the member's monitor address or port.
    monitor_address: v.monitor_address || null,
    monitor_port: v.monitor_port ?? null,
  };
}
