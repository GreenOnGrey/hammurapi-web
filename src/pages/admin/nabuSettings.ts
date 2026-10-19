import { useQuery } from "@tanstack/react-query";
import { api } from "../../api/client";
import type { NabuSettingsView } from "../../api/types";

// The settings of the connection to Nabu (FTR.HMR.CMN-0006 R10, R11): apart
// from the lazy administration, the navigation reads them too.
export const nabuAdminKey = ["admin", "nabu"] as const;

export function useNabuSettings(enabled = true) {
  return useQuery({
    queryKey: nabuAdminKey,
    queryFn: () => api.get<NabuSettingsView>("/admin/api/v1/nabu"),
    enabled,
    staleTime: 30_000,
  });
}
