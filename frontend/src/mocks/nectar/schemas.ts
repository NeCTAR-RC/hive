// The request bodies the mocked Nectar endpoints (account, identity and
// reservations) accept, each tied to the frontend's request type so the two
// cannot drift apart unnoticed.
import { z } from "zod";
import type { ProfileUpdateRequest } from "../../lib/api/types/account";
import type {
  ApplicationCredentialCreateRequest,
  MemberAddRequest,
} from "../../lib/api/types/identity";
import type { ReservationCreateRequest } from "../../lib/api/types/reservations";

export const profileUpdateBody = z.object({
  // The backend's Affiliation literal (backend/hive/schemas/account.py).
  affiliation: z.enum([
    "faculty",
    "student",
    "staff",
    "employee",
    "member",
    "affiliate",
    "alum",
    "library-walk-in",
  ]),
  phone_number: z.string().nullable(),
  mobile_number: z.string().nullable(),
}) satisfies z.ZodType<ProfileUpdateRequest>;

export const memberAddBody = z.object({
  email: z.string().min(1),
  role_id: z.string().min(1),
}) satisfies z.ZodType<MemberAddRequest>;

export const applicationCredentialCreateBody = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  secret: z.string().optional(),
  expiration_date: z.string().optional(),
  expiration_time: z.string().optional(),
  roles: z.array(z.string()),
  access_rules: z.string().optional(),
  unrestricted: z.boolean(),
}) satisfies z.ZodType<ApplicationCredentialCreateRequest>;

const isoDate = z.string().min(1);

export const reservationCreateBody = z.object({
  flavor_id: z.string().min(1),
  start: isoDate,
  end: isoDate,
}) satisfies z.ZodType<ReservationCreateRequest>;

export const reservationExtendBody = z.object({ end: isoDate });
