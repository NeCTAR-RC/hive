/**
 * A form value picked from a list the backend offers (a profile's
 * affiliations, the load balancer protocols and algorithms), typed as the
 * request field it fills. The contract names the field's values as a union;
 * the form holds a plain string because its options arrive at run time.
 * The backend validates the value and answers 422 to any other, so the SPA
 * does not repeat the list to check it.
 */
export function offered<T extends string>(value: string): T {
  return value as T;
}
