// Mutations for the account panels: My Details edits and the API password
// reset. The profile query itself lives in lib/queries so the home page can
// greet the user.
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../../lib/api/client";
import type {
  PasswordReset,
  Profile,
  ProfileUpdateRequest,
} from "../../lib/api/types";
import { profileQuery } from "../../lib/queries";

export function useUpdateProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: ProfileUpdateRequest) =>
      apiFetch<Profile>("/api/me/profile", { method: "PATCH", json: body }),
    onSuccess: (profile) => {
      queryClient.setQueryData(profileQuery.queryKey, profile);
    },
  });
}

export function useResetPassword() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch<PasswordReset>("/api/me/reset-password", { method: "POST" }),
    onSuccess: () => {
      // The session was re-issued on the new password.
      void queryClient.invalidateQueries({ queryKey: ["session"] });
    },
  });
}
