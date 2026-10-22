import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { api, qs } from "./client";
import type {
  Area, DiscoveryRequest, DiscoveryView, DomainDTO, IssueTopic, FeatureCard, FeatureSummary, Focus, GateDocument, Implementation, IssueCard, IssueDTO, List,
  Me, Overview, PendingApproval, Profile, PublicConfig, ReleaseCard, ReleaseDTO, RequirementRow, Revision, ServiceDTO, ValidationSummary,
} from "./types";

// Query keys in one place so SSE handlers can invalidate precisely.
export const keys = {
  config: ["config"] as const,
  me: ["me"] as const,
  profile: ["profile"] as const,
  domains: ["domains"] as const,
  approvals: ["approvals"] as const,
  focus: ["focus"] as const,
  overview: (d?: string) => (d ? (["overview", d] as const) : (["overview"] as const)),
  issues: (f?: object) => (f ? (["issues", f] as const) : (["issues"] as const)),
  issue: (key: string) => ["issue", key] as const,
  discovery: (key: string) => ["discovery", key] as const,
  topic: (key: string) => ["issue-topic", key] as const,
  discoveryRequest: (id: string) => ["discovery-request", id] as const,
  features: (f?: object) => (f ? (["features", f] as const) : (["features"] as const)),
  feature: (id: string) => ["feature", id] as const,
  requirements: (id: string) => ["requirements", id] as const,
  implementation: (id: string) => ["implementation", id] as const,
  validation: (id: string) => ["validation", id] as const,
  releases: (f?: object) => (f ? (["releases", f] as const) : (["releases"] as const)),
  release: (key: string) => ["release", key] as const,
  services: ["services"] as const,
  document: (id: string, area: string) => ["document", id, area] as const,
  history: (id: string, area: string) => ["history", id, area] as const,
  diff: (id: string, area: string) => ["diff", id, area] as const,
  chat: ["chat"] as const,
  attachments: ["attachments"] as const,
  importJob: (id: string) => ["import", id] as const,
  adminUsers: (q: string) => ["admin", "users", q] as const,
  adminDomains: ["admin", "domains"] as const,
  rules: (area: string) => ["admin", "rules", area] as const,
  ruleChanges: (area: string) => ["admin", "ruleChanges", area] as const,
  settings: ["admin", "settings"] as const,
  catalog: ["admin", "catalog"] as const,
  deploy: (env: string) => ["admin", "deploy", env] as const,
  metricSources: ["admin", "metricSources"] as const,
  // FTR.HMR.CMN-0004: the Agent section and the chat model.
  agentConnections: ["admin", "agent", "connections"] as const,
  agentModels: ["admin", "agent", "models"] as const,
  agentResolved: ["admin", "agent", "resolved"] as const,
  agentSkills: ["admin", "agent", "skills"] as const,
  agentMCP: ["admin", "agent", "mcp"] as const,
  agentUsage: (period: string) => ["admin", "agent", "usage", period] as const,
  chatSession: ["chat", "session"] as const,
  specTree: ["spec", "tree"] as const,
  specDoc: (key: string, area: string) => ["spec", "doc", key, area] as const,
  specFiles: (key: string, area: string) => ["spec", "files", key, area] as const,
  specSearch: (q: string, domain: string, area: string) => ["spec", "search", q, domain, area] as const,
  specScanSettings: ["admin", "spec-scan", "settings"] as const,
  specScanRuns: ["admin", "spec-scan", "runs"] as const,
  specScanIssues: ["admin", "spec-scan", "issues"] as const,
  missingCatalog: ["admin", "spec-scan", "missing-catalog"] as const,
};

export const useConfig = () =>
  useQuery({ queryKey: keys.config, queryFn: () => api.get<PublicConfig>("/api/v1/config"), staleTime: Infinity });

export const useMe = () =>
  useQuery({ queryKey: keys.me, queryFn: () => api.get<Me>("/api/v1/auth/me"), retry: false, staleTime: 60_000 });

export const useProfile = () => useQuery({ queryKey: keys.profile, queryFn: () => api.get<Profile>("/api/v1/profile") });

export const useDomains = () =>
  useQuery({ queryKey: keys.domains, queryFn: () => api.get<DomainDTO[]>("/api/v1/domains"), staleTime: 60_000 });

export const useApprovals = (enabled: boolean) =>
  useQuery({
    queryKey: keys.approvals,
    queryFn: () => api.get<List<PendingApproval>>("/api/v1/approvals?limit=100"),
    enabled,
  });

export const useFocus = () => useQuery({ queryKey: keys.focus, queryFn: () => api.get<Focus>("/api/v1/focus") });

export const useOverview = (domain: string) =>
  useQuery({ queryKey: keys.overview(domain), queryFn: () => api.get<Overview>(`/api/v1/overview${qs({ domain })}`) });

export interface IssueFilter {
  domain: string;
  type: string;
  status: string;
  q: string;
  /** FTR.HMR.DISC-0001 R17: agentUsd, personHours or days, "-" first for the descending order. */
  sort?: string;
}

export const useIssues = (f: IssueFilter) =>
  useQuery({ queryKey: keys.issues(f), queryFn: () => api.get<List<IssueDTO>>(`/api/v1/issues${qs({ ...f, limit: 200 })}`) });

export const useIssue = (key: string, enabled = true) =>
  useQuery({ queryKey: keys.issue(key), queryFn: () => api.get<IssueCard>(`/api/v1/issues/${key}`), retry: false, enabled });

/** The topic of the user for the issue in Nabu (FTR.HMR.DISC-0001 R2, R3); null — the draft. */
export const useIssueTopic = (key: string, enabled: boolean) =>
  useQuery({ queryKey: keys.topic(key), queryFn: () => api.get<IssueTopic>(`/api/v1/issues/${key}/topic`), enabled, retry: 1 });

/** An instruction to the researcher with its state (FTR.HMR.DISC-0001 tech §3.2). */
export const useDiscoveryRequest = (id: string) =>
  useQuery({ queryKey: keys.discoveryRequest(id), queryFn: () => api.get<DiscoveryRequest>(`/api/v1/discovery-requests/${id}`), staleTime: 30_000 });

export const useDiscovery = (key: string) =>
  useQuery({ queryKey: keys.discovery(key), queryFn: () => api.get<DiscoveryView>(`/api/v1/issues/${key}/discovery`) });

export const useRevisions = (key: string, enabled: boolean) =>
  useQuery({
    queryKey: ["revisions", key],
    queryFn: () => api.get<List<Revision>>(`/api/v1/issues/${key}/discovery/history`),
    enabled,
  });

export interface FeatureFilter {
  domain: string;
  phase: string;
  status: string;
  q: string;
}

export const useFeatures = (f: FeatureFilter) =>
  useQuery({
    queryKey: keys.features(f),
    queryFn: () => api.get<List<FeatureSummary>>(`/api/v1/features${qs({ ...f, limit: 200 })}`),
  });

export const useFeature = (id: string) =>
  useQuery({ queryKey: keys.feature(id), queryFn: () => api.get<FeatureCard>(`/api/v1/features/${id}`), retry: false });

export const useRequirements = (id: string) =>
  useQuery({ queryKey: keys.requirements(id), queryFn: () => api.get<RequirementRow[]>(`/api/v1/features/${id}/requirements`) });

export const useImplementation = (id: string) =>
  useQuery({ queryKey: keys.implementation(id), queryFn: () => api.get<Implementation>(`/api/v1/features/${id}/implementation`) });

export const useValidation = (id: string) =>
  useQuery({ queryKey: keys.validation(id), queryFn: () => api.get<ValidationSummary>(`/api/v1/features/${id}/validation`) });

export const useReleases = (f: { domain: string; status: string }) =>
  useQuery({ queryKey: keys.releases(f), queryFn: () => api.get<List<ReleaseDTO>>(`/api/v1/releases${qs({ ...f, limit: 200 })}`) });

export const useRelease = (key: string) =>
  useQuery({ queryKey: keys.release(key), queryFn: () => api.get<ReleaseCard>(`/api/v1/releases/${key}`), retry: false });

export const useServices = () =>
  useQuery({ queryKey: keys.services, queryFn: () => api.get<ServiceDTO[]>("/api/v1/services"), staleTime: 30_000 });

export const useDocument = (id: string, area: Area | undefined) =>
  useQuery({
    queryKey: keys.document(id, area ?? ""),
    queryFn: () => api.get<GateDocument>(`/api/v1/features/${id}/gates/${area}/document`),
    enabled: !!area,
  });

export function invalidateFeature(qc: QueryClient, id: string) {
  qc.invalidateQueries({ queryKey: keys.feature(id) });
  qc.invalidateQueries({ queryKey: ["history", id] });
  qc.invalidateQueries({ queryKey: ["diff", id] });
  qc.invalidateQueries({ queryKey: keys.features() });
  qc.invalidateQueries({ queryKey: keys.requirements(id) });
  qc.invalidateQueries({ queryKey: keys.implementation(id) });
  qc.invalidateQueries({ queryKey: keys.validation(id) });
  qc.invalidateQueries({ queryKey: keys.focus });
  qc.invalidateQueries({ queryKey: keys.overview() });
}

export function invalidateCycle(qc: QueryClient) {
  for (const k of [keys.focus, keys.overview(), keys.issues(), keys.features(), keys.releases(), ["issue"], ["release"], ["feature"],
  ["discovery"], ["implementation"], ["validation"], ["requirements"]]) {
    qc.invalidateQueries({ queryKey: k });
  }
}

export const useQC = useQueryClient;
