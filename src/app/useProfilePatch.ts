import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";
import { keys } from "../api/queries";
import type { Profile } from "../api/types";
import { errorText } from "../lib/errors";
import { useToast } from "@green-on-grey/ui-kit";

/** PATCH /api/v1/profile; shared by the profile menu and the agent settings of the chat. */
export function useProfilePatch() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (p: Partial<Profile>) => api.patch<Profile>("/api/v1/profile", p),
    onSuccess: (p) => {
      qc.setQueryData(keys.profile, p);
      qc.invalidateQueries({ queryKey: keys.me });
      qc.invalidateQueries({ queryKey: keys.features() });
    },
    onError: (e) => toast({ kind: "error", title: errorText(t, e) }),
  });
}
