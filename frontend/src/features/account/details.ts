// Pure rules of the contact details form on My Details: its schema, its
// values from the profile, and the update request it sends.
import { z } from "zod";
import type {
  Profile,
  ProfileUpdateRequest,
} from "../../lib/api/types/account";
import { maxLength } from "../../lib/validation";

export const detailsSchema = z.object({
  affiliation: z.string().min(1, "Choose your affiliation"),
  phone_number: maxLength(64),
  mobile_number: maxLength(64),
});

export type DetailsValues = z.infer<typeof detailsSchema>;

/** The form's values from the profile, "" for a field it does not hold. */
export function detailsValues(profile: Profile): DetailsValues {
  return {
    affiliation: profile.affiliation ?? "",
    phone_number: profile.phone_number ?? "",
    mobile_number: profile.mobile_number ?? "",
  };
}

/**
 * The profile update: a cleared phone or mobile number is sent as null.
 * The affiliation select offers only the profile's own `affiliations`, the
 * backend's list, so its value is one the request type names (the backend
 * answers 422 to any other).
 */
export function detailsRequest(values: DetailsValues): ProfileUpdateRequest {
  return {
    affiliation: values.affiliation as ProfileUpdateRequest["affiliation"],
    phone_number: values.phone_number || null,
    mobile_number: values.mobile_number || null,
  };
}
