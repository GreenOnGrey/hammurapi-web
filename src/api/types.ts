// Types of the Hammurapi API (hammurapi-core). Keep in sync with the Go DTOs.
import type { ChatSubagent } from "@green-on-grey/ui-kit/chat";

export const AREAS = ["product", "design", "arch", "tech", "qa"] as const;
export type Area = (typeof AREAS)[number];
export type ExpertKind = "product" | "technical";
export type GateStatus = "draft" | "in_review" | "approved";
export type FeaturePhase = "spec" | "codegen" | "validation" | "in_release" | "released" | "rolled_back" | "deleted"
  /** Found in the default branch and indexed as implemented (FTR.HMR.CMN-0005 R4). */
  | "indexed";
export type Autonomy = "plan" | "pr" | "autonomous";
export type IssueType = "idea" | "problem";
export type IssueStatus = "new" | "discovery" | "verification" | "accepted" | "resolved" | "rejected" | "merged";
/** The statuses that end the research of an issue (FTR.HMR.DISC-0001 R25). */
export const RESEARCH_ENDED: readonly IssueStatus[] = ["accepted", "rejected", "merged"];
export type ReleaseStatus = "merging" | "deploying" | "enabling_flags" | "evaluating" | "awaiting_confirmation" | "succeeded" | "rolling_back" | "rolled_back";
/** Who approves an area: product and design — product experts, the rest — technical. */
export const approverKind = (a: Area): ExpertKind => (a === "product" || a === "design" ? "product" : "technical");
/** Generated gates are written by the agent (FTR.HMR.CMN-0002 R12–R14). */
export const isGenerated = (a: Area) => a === "tech" || a === "qa";
export type Tone = "business" | "friendly" | "concise" | "mentor";
export type ChatMode = "general" | "spec";

export interface List<T> {
  items: T[];
  nextCursor: string | null;
}

export interface PublicConfig {
  provider: "github" | "gitlab";
  /** Sign-in provider (FTR.HMR.CMN-0006 R1): the git provider, GitHub with an organization, or OIDC. */
  login?: { kind: "git" | "github" | "oidc"; label: string; org?: string; linksGit?: boolean };
  /** The site of Nabu (FTR.HMR.CMN-0007 R11): a code task links to its agent there; the agent is always Nabu (R1). */
  nabuWebUrl?: string;
  uploadMaxBytes: number;
  uploadAllowedTypes: string[];
  importMaxBytes: number;
  languages: string[];
  defaultLanguage: string;
  defaultBranch: string;
  /** The version of the document contract: the version of speclint in CI (FTR.HMR.SPEC-0002 R1); absent in an older core. */
  contractVersion?: string;
}

/** The status of the check of speclint in CI of a repository (FTR.HMR.SPEC-0002 tech §3.3). */
export interface CiCheck {
  status: "none" | "proposed" | "on" | "outdated" | "manual";
  version: string | null;
  contractVersion: string;
  path: string | null;
  repo: string;
  pr: { number: number; url: string; kind: "propose" | "bump" } | null;
  error: string | null;
  checkedAt: string | null;
}

/** The installation token for CI without OIDC as Settings show it (FTR.HMR.SPEC-0003 tech §3.2). */
export interface CiToken {
  issued: boolean;
  prefix: string | null;
  createdAt: string | null;
  createdBy: string | null;
  lastUsedAt: string | null;
}

export interface ExpertDomains {
  domain: string;
  kinds: ExpertKind[];
}

export interface Me {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  globalAdmin: boolean;
  areaAdmin: Area[];
  experts: ExpertDomains[];
  ownedServices: string[];
  language: string;
  theme: "light" | "dark";
  agentName: string;
  agentTone: Tone;
  email?: string | null;
  gitAccount?: GitAccount | null;
}

export interface GitAccount {
  provider: string;
  login: string;
  emails: string[];
  linkedAt: string;
}

export interface Profile {
  language: string;
  theme: "light" | "dark";
  domains: string[];
  agentName: string;
  agentTone: Tone;
}

export interface SystemDTO {
  key: string;
  name: string;
  lastNumber: number;
  source: "manual" | "backstage";
  deletedInCatalog: boolean;
}

export interface ExpertUser {
  id: string;
  username: string;
  displayName: string;
}

export interface DomainDTO {
  key: string;
  name: string;
  approvalRequired: boolean;
  source: "manual" | "backstage";
  deletedInCatalog: boolean;
  createdAt: string;
  systems: SystemDTO[];
  experts: { product: ExpertUser[]; technical: ExpertUser[] };
}

export interface Gate {
  area: Area;
  status: GateStatus;
  generated: boolean;
  headCommit: string;
  submittedAt: string | null;
  approvedCommit: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  createdAt: string;
}

export interface FeatureSummary {
  uniqueId: string;
  domain: string;
  system: string;
  title: string;
  phase: FeaturePhase;
  approvalRequired: boolean;
  isProblem: boolean;
  imported: boolean;
  parent: string | null;
  issues: string[];
  createdAt: string;
  gates: Gate[];
  /** Absent in the answer of a core older than this field. */
  skippedAreas?: Area[];
}

export interface LockInfo {
  userId: string;
  userName: string;
  lockedAt: string;
  expiresAt: string;
}

export interface FeatureRef {
  uniqueId: string;
  title: string;
  phase: FeaturePhase;
}

export interface Permissions {
  edit: Area[];
  submit: Area[];
  approve: Area[];
  advance: boolean;
  request: boolean;
  retry: boolean;
  codegen: boolean;
  delete: boolean;
  setFlag: boolean;
}

export interface Measure {
  source: string;
  query: string;
  target: string;
  window: string;
}

export interface FeatureCard {
  uniqueId: string;
  domain: string;
  system: string;
  title: string;
  phase: FeaturePhase;
  approvalRequired: boolean;
  isProblem: boolean;
  imported: boolean;
  branch: string;
  pr: { number: number; url: string };
  parent: string | null;
  fixes: FeatureRef[];
  issues: string[];
  services: { key: string; repo: string; autonomy: Autonomy }[];
  release: string | null;
  metric: Measure | null;
  flagKey: string | null;
  gates: Gate[];
  pendingGates: Area[];
  lock: LockInfo | null;
  workflow: { kind: string; state: string; step: string | null; lastError: string | null } | null;
  tokensIn: number;
  tokensOut: number;
  createdBy: string;
  createdAt: string;
  permissions: Permissions;
  /** FTR.HMR.DEV-0001: the stages of the specification and the writer. */
  specFlow: "writer" | "legacy";
  specStage: "product" | "design" | "arch" | "generated" | null;
  skippedAreas: Area[];
  writerRun: WriterRun | null;
  openQuestions: Partial<Record<Area, number>>;
}

/** The run of the writer in progress. */
export interface WriterRun {
  mode: "write" | "impact" | "generate";
  state: "queued" | "generating";
  areas: Area[];
  waitingLock: boolean;
}

export interface GateDocument {
  content: string;
  sha: string;
  fix: boolean;
  generated: boolean;
  warnings: string[];
  unnumberedRequirements: string[];
  lock: LockInfo | null;
  readOnly: boolean;
}

export interface DiffLine {
  op: "=" | "+" | "-";
  text: string;
  section?: string;
}

export interface DiffResult {
  base: string;
  baseLabel: "approved" | "default_branch";
  head: string;
  approvedBy: string | null;
  approvedAt: string | null;
  baseUrl: string;
  headUrl: string;
  lines: DiffLine[];
}

export type GateEventType = "created" | "edited" | "submitted" | "approved" | "reset" | "deleted" | "generated";

export interface HistoryItem {
  id: string;
  type: GateEventType;
  actor: string | null;
  isAgent: boolean;
  commit: string | null;
  commitUrl: string | null;
  createdAt: string;
}

export interface PendingApproval {
  uniqueId: string;
  title: string;
  domain: string;
  system: string;
  area: Area;
  submittedBy: string | null;
  submittedAt: string;
}

export interface AttachmentRef {
  id: string;
  fileName: string;
  mimeType: string;
}

export interface Attachment extends AttachmentRef {
  sizeBytes: number;
  messageId: string | null;
  feature: string | null;
  mode: ChatMode | null;
  createdAt: string;
}

export type ContextType = "issue" | "feature" | "release";

export interface AdminUser {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  globalAdmin: boolean;
  areaAdmin: Area[];
  experts: ExpertDomains[];
  createdAt: string;
  /** FTR.HMR.CMN-0006: email, sign-in identities (issuers) and the git account. */
  email?: string | null;
  logins?: string[];
  gitLogin?: string | null;
  createdVia?: "login" | "nabu_delegation";
  linkReview?: boolean;
}

export interface RuleFile {
  file: "template" | "fix-template";
  path: string;
  content: string;
  sha: string;
}

export interface RuleChange {
  id: string;
  area: Area;
  file: "template" | "fix-template";
  branch: string;
  prNumber: number;
  prUrl: string;
  comment: string | null;
  status: "open" | "merged" | "withdrawn";
  authorId: string;
  author: string;
  approvedBy: string | null;
  createdAt: string;
  closedAt: string | null;
  lines?: DiffLine[];
}

export interface Issue {
  code: string;
  params?: Record<string, unknown>;
}

export interface ImportFeaturePreview {
  archiveId: string;
  newId: string | null;
  domain: string;
  system: string;
  title: string;
  areas: string[];
  files: number;
  fileNames: string[];
  parent: string | null;
  errors: Issue[];
  warnings: Issue[];
}

export interface ImportRulePreview {
  area: string;
  file: string;
  action: "propose" | "skip";
  reason?: string;
  result?: string;
  prUrl?: string;
}

export interface ImportResult {
  archiveId: string;
  status: "pending" | "skipped" | "imported" | "failed";
  newId: string | null;
  prUrl: string | null;
  gates: number;
  error: string | null;
}

export interface ImportJob {
  id: string;
  status: "validated" | "running" | "done" | "failed" | "cancelled";
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  fileName: string;
  size: number;
  features: ImportFeaturePreview[];
  rules: ImportRulePreview[];
  admins: string[];
  results: ImportResult[];
}

// ─── FTR.HMR.CMN-0002: the closed cycle ──────────────────────────────────

export interface Activity {
  id: string;
  type: string;
  actor: string | null;
  isAgent: boolean;
  payload: Record<string, unknown> | null;
  createdAt: string;
}

export interface IssueDTO {
  key: string;
  domain: string;
  type: IssueType;
  title: string;
  description: string;
  source: string;
  status: IssueStatus;
  author: string | null;
  mergedInto: string | null;
  rejectReason: string | null;
  rolledBackRelease: string | null;
  createdAt: string;
  updatedAt: string;
  /** FTR.HMR.DISC-0001 R17: the summary of the draft estimate in the Research list. */
  estimate?: EstimateTotals | null;
}

// ─── FTR.HMR.DISC-0001: the draft estimate, the topic of an issue, instructions ──

export type EstimateConfidence = "high" | "medium" | "low";
export type EstimateAgentStage = "spec" | "codegen" | "checks";
export type EstimatePeopleStage = "spec" | "approval" | "validation" | "release";
export type Expertise = "product" | "tech";

export interface Estimate {
  agent: { stage: EstimateAgentStage; usd: number; tokens: number }[];
  people: { stage: EstimatePeopleStage; expertise: Expertise; personHours: number }[];
  days: number;
  waitDays: number;
  confidence: EstimateConfidence;
  basis: { features: string[]; judgement: boolean };
}

export interface EstimateTotals {
  agentUsd: number;
  agentTokens?: number;
  personHours: number;
  days: number;
  confidence: EstimateConfidence;
}

export interface IssueTopic {
  conversationId: string | null;
  title: string;
}

/** An open question of the researcher to the experts (FTR.HMR.DISC-0001 R26, tech §5.6). */
export interface DiscoveryQuestion {
  id: string;
  round: number;
  title: string;
  body: string;
  options: string[];
  recommended: string;
  why: string;
}

/** An answer in an instruction (R27, R28): an expert on the page, the user in the chat or the agent from memory, confirmed. */
export interface DiscoveryAnswer {
  questionId: string;
  question: string;
  answer: string;
  source: "expert" | "user" | "memory";
}

export interface DiscoveryRequest {
  id: string;
  issueKey: string;
  author: string | null;
  instructions: string;
  answers?: DiscoveryAnswer[];
  context?: string | null;
  state: "queued" | "running" | "done" | "failed";
  position: number | null;
  revision: number | null;
  error: string | null;
  createdAt: string;
  finishedAt: string | null;
}

/** The payload of a notice of Hammurapi in a topic (FTR.HMR.DISC-0001 tech §5.3). */
export interface DiscoveryNoticePayload {
  kind: "discovery.revision" | "discovery.failed";
  issueKey: string;
  revision: number;
  requestIds: string[];
  coAuthors: string[];
  error?: string;
}

/** A question of the writer for the current user (FTR.HMR.DEV-0001 tech §2.2). */
export interface SpecQuestion extends DiscoveryQuestion {
  audience: "product" | "technical";
  touches?: Area[];
  skipArea?: Area;
  canAnswer: boolean;
  forOthers: boolean;
}

export interface SpecGateQuestions {
  area: Area;
  round: number;
  roundsLeft: number;
  questions: SpecQuestion[];
}

/** An instruction to the writer. */
export interface SpecRequest {
  id: string;
  featureKey: string;
  author: string | null;
  areas: Area[];
  skipAreas: Area[];
  restoreAreas: Area[];
  instructions: string;
  context?: string | null;
  answers?: (DiscoveryAnswer & { area?: Area })[];
  state: "queued" | "running" | "done" | "failed";
  position: number | null;
  /** Waits for «Retry» of a stopped run. */
  blocked: boolean;
  commits: Partial<Record<Area, string>>;
  error: string | null;
  createdAt: string;
  finishedAt: string | null;
}

/** The payload of a notice of the writer in a topic. */
export interface SpecNoticePayload {
  kind: "spec.revision" | "spec.failed" | "spec.conflict";
  featureKey: string;
  areas: Area[];
  otherAreas: Area[];
  requestIds: string[];
  coAuthors: string[];
  error?: string;
}

export interface IssueCard extends IssueDTO {
  movedFrom: string[];
  features: string[];
  releases: string[];
  mergedFrom: string[];
  attachments: AttachmentRef[];
  activity: Activity[];
  tokensIn: number;
  tokensOut: number;
  permissions: { verify: boolean; reopen: boolean; discover: boolean };
}

export interface DiscoveryView {
  content?: string;
  value?: string | null;
  measure?: Measure | null;
  measureCheckedAt?: string | null;
  /** FTR.HMR.DISC-0001 design §3.6b: how an item relates and whether it may be a duplicate. */
  similar?: { key: string; title: string; kind: "issue" | "feature"; note?: string; duplicate?: boolean }[];
  systems?: string[];
  services?: string[];
  problemTarget?: string | null;
  revision?: number;
  updatedAt?: string;
  complete: boolean;
  missing: string[];
  workflow: { state: string; lastError: string | null; updatedAt: string; nextRunAt: string | null } | null;
  estimate?: Estimate | null;
  estimateTotals?: EstimateTotals | null;
  changeSummary?: string | null;
  /** The revision of the researcher going on (FTR.HMR.DISC-0001 design §3.5). */
  running?: { requestAuthors: string[]; queued: number } | null;
  /** The open questions of the round and the latest round (FTR.HMR.DISC-0001 R26, tech §3.3). */
  questions?: DiscoveryQuestion[];
  questionRound?: number;
}

export interface Revision {
  revision: number;
  content: string;
  isAgent: boolean;
  actor: string | null;
  createdAt: string;
  changeSummary?: string | null;
  /** The instructions the revision answers (FTR.HMR.DISC-0001 design §3.5). */
  requests?: { id: string; author: string | null; instructions: string; questions?: string[] }[];
}

export interface ServiceDTO {
  key: string;
  name: string;
  system: string | null;
  domain: string | null;
  repo: string;
  ownerRef: string;
  owners: string[];
  autonomy: Autonomy;
  deployOverride: Record<string, { workflow?: string; ref?: string; params?: Record<string, string> }> | null;
  overrideFromCatalog: boolean;
  source: "manual" | "backstage";
  catalogRef: string | null;
  deletedInCatalog: boolean;
  /** FTR.HMR.CMN-0008 R1. */
  check: ServiceCheck | null;
}

export interface ServiceCheck {
  command: string;
  timeoutSec: number;
}

/** The readiness check of a code task (FTR.HMR.CMN-0008 R10, R18). */
export interface TaskCheck {
  status: "passed" | "failed" | "unavailable" | "not_run" | "unverified";
  reason?: string;
  command: string;
  attempts: number;
  maxAttempts: number;
  exitCode?: number;
  outputTail?: string;
}

export interface TaskDTO {
  id: string;
  type: "implement" | "address_review" | "update_pr" | "revert" | "ci_setup";
  status: "queued" | "running" | "succeeded" | "failed" | "cancelled";
  service: string;
  result: { plan?: string; summary?: string; prNumber?: number; check?: TaskCheck; warnings?: string[]; stalled?: boolean } | null;
  progress: string | null;
  error: string | null;
  tokensIn: number;
  tokensOut: number;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  /** FTR.HMR.CMN-0007 R11: the class of the error and the run of Nabu. */
  errorClass?: string | null;
  nabuRunId?: string | null;
  /** FTR.HMR.DEV-0004 R12–R14: what «Повторить» does; missing with an older core — a new run of the agent. */
  retry?: "agent" | "commit" | "rerun";
}

// ─── FTR.HMR.DEV-0004: the cost of a feature and the log of a run ───

export interface CostTokens { in: number; out: number; cacheRead: number; cacheWrite: number }

export interface CostRun {
  id: string;
  runId: string | null;
  at: string;
  reason: string | null;
  status: "succeeded" | "failed" | "cancelled" | "running";
  model: string;
  /** null — the price of the model is unknown (R6) */
  costUsd: number | null;
  costKnown: boolean;
  tokens: CostTokens;
  /** a run of the writer for several gates: its whole figures (R4a) */
  shared?: { areas: string[]; costUsd: number | null; tokens: CostTokens };
  logAvailable: boolean;
}

export interface CostSum { costUsd: number; unknownRuns: number; runs: number; running: number; tokens: CostTokens }

export interface CostItem extends CostSum {
  kind: "area" | "service" | "checks" | "legacy";
  key: string | null;
  list?: CostRun[];
}

export interface FeatureCost { total: CostSum; items: CostItem[]; canViewLog: boolean }

export interface RunLogEntry {
  id: string;
  kind: "message" | "tool" | "check" | "stalled" | "error" | "done" | "step" | "expired";
  at?: string;
  text?: string;
  tool?: string;
  args?: unknown;
  command?: string;
  isError?: boolean;
  /** null while the tool runs */
  result?: string | null;
  data?: Record<string, unknown>;
  step?: string;
  status?: string;
  detail?: string;
  retry?: boolean;
}

export interface PRDTO {
  id: string;
  repo: string;
  number: number;
  url: string;
  title: string;
  branch: string;
  kind: "spec" | "service" | "revert";
  service: string | null;
  byAgent: boolean;
  state: "open" | "merged" | "closed";
  review: "none" | "required" | "changes_requested" | "approved" | "not_required";
  headSha: string;
  /** FTR.HMR.DEV-0004 R17: the checks of the provider on the head; none — no checks, null — not asked yet */
  ciStatus: "pending" | "success" | "failure" | "none" | null;
  mergeSha: string | null;
  mergedAt: string | null;
  requirements: string[];
  createdAt: string;
}

export interface RequirementRow {
  id: string;
  text: string;
  services: string[];
  /** FTR.HMR.SPEC-0005 R6: services — the column «Сервисы» of qa; empty or missing (an older core) — every service. */
  testCases: { id: string; level: string; title: string; services?: string[] }[];
  prs: { service: string | null; number: number; url: string; byAgent: boolean; state: string }[];
}

export interface ServiceImpl {
  service: string;
  repo: string;
  autonomy: Autonomy;
  check: ServiceCheck | null;
  tasks: TaskDTO[];
  pr: PRDTO | null;
  plan: string | null;
}

export interface Implementation {
  phase: FeaturePhase;
  workflow: { state: string; step: string; lastError: string | null } | null;
  services: ServiceImpl[];
  matrix: RequirementRow[];
  humanPrs: PRDTO[];
  tokensIn: number;
  tokensOut: number;
  canStart: boolean;
}

export interface DeployRun {
  id: string;
  environment: "stage" | "production";
  service: string;
  ref: string;
  status: "triggered" | "started" | "success" | "failure" | "timeout";
  signal: "pipeline" | "tag" | "manual" | null;
  version: string | null;
  runUrl: string | null;
  error: string | null;
  markedBy: string | null;
  isRollback: boolean;
  createdAt: string;
  finishedAt: string | null;
}

export interface Signature {
  side: ExpertKind;
  user: string;
  comment: string | null;
  signedAt: string;
}

export interface TestRow {
  id: string;
  level: string;
  title: string;
  requirements: string[];
  status: "passed" | "failed" | "skipped" | "missing";
  environment: string;
}

export interface ValidationSummary {
  phase: FeaturePhase;
  state: string;
  lastError: string | null;
  ciComplete: boolean;
  tests: TestRow[];
  coverage: { requirements: number; withTests: number; withPrs: number; passed: number };
  matrix: RequirementRow[];
  discrepancies: { id: string; requirement: string; service: string | null; prUrl: string | null; description: string; foundAt: string }[];
  /** FTR.HMR.CMN-0008 design §3.5. */
  autofixing: number;
  reviews: { service: string; pr: number; url: string; review: string; ci: string; byAgent: boolean; required: boolean; passed: boolean }[];
  stage: { enabled: boolean; configured: boolean; deploys: DeployRun[] };
  signatures: Signature[];
  permissions: { signProduct: boolean; signTechnical: boolean; return: boolean; markStage: boolean };
}

export interface ReleaseDTO {
  key: string;
  feature: string;
  featureTitle: string;
  domain: string;
  status: ReleaseStatus;
  plan: { order: string[] };
  metricResult: string | null;
  confirmedBy: string | null;
  confirmedAt: string | null;
  rollbackReason: string | null;
  rolledBackBy: string | null;
  rolledBackAt: string | null;
  blockedReason: string | null;
  createdAt: string;
}

export interface ReleaseCard extends ReleaseDTO {
  issues: string[];
  prs: PRDTO[];
  deploys: DeployRun[];
  step: string;
  blocked: boolean;
  currentService: string | null;
  flagKey: string | null;
  flagState: "on" | "off" | null;
  flagsEnabled: boolean;
  metric: Measure | null;
  rollback: { state: string; step: string; lastError: string | null } | null;
  activity: Activity[];
  tasks: TaskDTO[];
  tokensIn: number;
  tokensOut: number;
  permissions: { editPlan: boolean; startMerge: boolean; markDeploy: boolean; retry: boolean; markFlag: boolean; confirm: boolean; rollback: boolean };
}

export type FocusAction =
  | "verify_discovery" | "approve_gate" | "sign_validation" | "start_merge" | "mark_deploy"
  | "retry_or_rollback" | "mark_flag" | "confirm_release" | "resolve_blocked"
  | "agent_not_configured" | "connection_problem" | "mcp_problem"
  | "missing_catalog" | "bad_id" | "missing_parent" | "deleted";

export interface FocusItem {
  kind: ContextType | "agent" | "connection" | "mcp_server" | "spec";
  key: string;
  title: string;
  action: FocusAction;
  waitingSince: string;
  hint?: string | null;
}

export interface Focus {
  research: FocusItem[];
  development: FocusItem[];
  release: FocusItem[];
  /** Global administrators: the agent needs attention (FTR.HMR.CMN-0004 R21). */
  agent?: FocusItem[];
  /** Global administrators: problems of indexing the specification repository (FTR.HMR.CMN-0005 R10). */
  spec?: FocusItem[];
}

export interface OverviewCard {
  key: string;
  title: string;
  type?: IssueType;
  status: string;
  feature?: string;
  issues: string[];
  step?: string | null;
  done: number;
  total: number;
  blocked: boolean;
  domain: string;
  /** FTR.HMR.DISC-0001 R17: days and person-hours on the card of an issue. */
  estimate?: { days: number; personHours: number } | null;
}

export interface Overview {
  issues: OverviewCard[];
  features: OverviewCard[];
  releases: OverviewCard[];
}

export interface CodegenPlan {
  services: { service: string; repo: string; autonomy: Autonomy; requirements: string[] }[];
}

export interface CatalogSettings {
  enabled: boolean;
  catalogRepo: string;
  catalogGlob: string;
  serviceFilePath: string;
  serviceRepos: string[];
  lastSyncAt: string | null;
  lastSyncError: string | null;
}

export interface CatalogError {
  kind: string;
  name: string;
  catalogRef: string;
  reason: string;
  seenAt: string;
}

export type DeployType = "github-actions" | "gitlab-ci" | "webhook";

export interface DeployConfig {
  type: DeployType;
  workflow?: string;
  ref?: string;
  url?: string;
  auth: "bot" | "secret";
  params: Record<string, string> | null;
  timeoutMinutes: number;
}

export interface DeploySettings {
  environment: "stage" | "production";
  configured: boolean;
  settings?: DeployConfig;
  activeSecrets?: number;
  updatedAt?: string;
  secret?: string;
}

export interface MetricSource {
  name: string;
  type: "clickhouse" | "prometheus";
  endpoint: string;
  username: string | null;
  secretRef: string;
  limits: { maxExecutionSeconds: number; maxResultRows: number; maxRangeDays: number };
}

export interface CycleSettings {
  attachmentRetentionDays: number;
  featureFlags: { enabled: boolean; activeSecrets: number };
  stage: { enabled: boolean };
  runnerExecutor: string;
}

// ─── FTR.HMR.CMN-0004: the agent (Pi) and its configuration ───────────

export type AgentScenario = "chat" | "issue_analysis" | "gate_generation" | "conformance_check" | "codegen" | "review_update" | "rollback_revert";
export const AGENT_SCENARIOS: AgentScenario[] = ["chat", "issue_analysis", "gate_generation", "conformance_check", "codegen", "review_update", "rollback_revert"];
/** Stage rows of the scenario table (design §3). */
export const SCENARIO_STAGE: Record<AgentScenario, "all" | "discovery" | "development" | "delivery"> = {
  chat: "all", issue_analysis: "discovery", gate_generation: "development", conformance_check: "development",
  codegen: "development", review_update: "development", rollback_revert: "delivery",
};

export type LLMErrorClass = "insufficient_balance" | "auth" | "rate_limit" | "unavailable" | "bad_request" | "context_overflow" | "agent_crashed";
export type ConnectionStatus = "unknown" | "ok" | "insufficient_balance" | "auth" | "unavailable" | "disabled";

export interface AgentModelDef {
  id: string;
  name?: string;
  contextWindow: number;
  maxTokens: number;
  reasoning: boolean;
  input: string[];
  thinkingLevelMap?: Record<string, string | null>;
  cost: { input: number; output: number; cacheRead: number; cacheWrite: number };
}

export interface LLMConnection {
  id: string;
  name: string;
  type: "deepseek";
  baseUrl: string;
  models: AgentModelDef[];
  keyLast4: string;
  enabled: boolean;
  status: ConnectionStatus;
  statusReason: string | null;
  statusAt: string | null;
  createdAt: string;
}

export interface LLMCheckResult {
  model: string;
  ok: boolean;
  latencyMs?: number;
  errorClass?: LLMErrorClass;
  httpStatus?: number;
  message?: string;
}

export interface ModelChoice {
  connectionId: string;
  model: string;
  thinking: string;
}

export interface ScenarioModels {
  default: ModelChoice | null;
  scenarios: Record<AgentScenario, ModelChoice | null>;
}

export interface ResolvedModel {
  scenario: AgentScenario;
  stage: string;
  inherited: boolean;
  connectionId: string;
  connectionName: string;
  model: string;
  thinking: string;
  status: ConnectionStatus;
}

export interface SkillChange {
  id: string;
  skill: string;
  kind: "add" | "change" | "delete";
  prUrl: string;
  prNumber: number;
  authorId: string;
  author: string;
  state: "open" | "merged" | "closed";
  createdAt: string;
}

export interface AgentSkill {
  name: string;
  description: string;
  scenarios: AgentScenario[];
  status: "active" | "pending_add" | "pending_change" | "pending_delete";
  change?: SkillChange;
}

export interface MCPServerInfo {
  id: string | null;
  name: string;
  url: string;
  headers: { name: string; last4: string }[];
  exposure: "direct" | "deferred";
  scenarios: AgentScenario[];
  enabled: boolean;
  builtin: boolean;
  status: string;
  statusReason: string | null;
  toolsCount: number | null;
  statusAt: string | null;
}

export interface MCPCheckResult {
  ok: boolean;
  tools: { name: string; description?: string; readOnly: boolean; destructive: boolean }[];
  error?: string;
}

export interface UsageTotals {
  costUsd: number;
  tokensIn: number;
  tokensOut: number;
  cacheRead: number;
  cacheWrite: number;
  runs: number;
}

export interface UsageReport {
  from: string;
  to: string;
  totals: UsageTotals;
  rows: { key: Record<string, string>; costUsd: number; tokensIn: number; tokensOut: number; cacheRead: number; runs: number }[];
}

// ─── Specification navigator and repository check (FTR.HMR.CMN-0005) ───

export type SpecArea = "product" | "design" | "arch" | "tech" | "qa";
export const SPEC_AREAS: SpecArea[] = ["product", "design", "arch", "tech", "qa"];
/** The folder of the materials of the research beside the areas: a tab of a document, not a gate (FTR.HMR.DISC-0001 R30). */
export const DISCOVERY = "discovery";
export type DocArea = SpecArea | typeof DISCOVERY;

export interface SpecTreeFeature {
  key: string;
  title: string;
  phase: FeaturePhase;
  source: "hammurapi" | "repository";
  areas: SpecArea[];
  fixes: SpecTreeFeature[];
}

export interface SpecTree {
  commit: string;
  domains: { key: string; name: string; systems: { key: string; name: string; count: number; features: SpecTreeFeature[] }[] }[];
}

export interface SpecHeading {
  level: number;
  text: string;
  slug: string;
}

export interface SpecPR {
  kind: "service" | "spec";
  service?: string;
  repo: string;
  number: number;
  url: string;
  mergedAt: string | null;
}

export interface SpecDocument {
  featureKey: string;
  area: DocArea;
  /** discovery comes first when the feature has its materials (FTR.HMR.DISC-0001 R30). */
  areas: DocArea[];
  path: string;
  title: string;
  markdown: string;
  toc: SpecHeading[];
  blobSha: string;
  commit: string;
  /** Absent when the history of the file cannot be built (FTR.HMR.SPEC-0001 R13). */
  historyUrl?: string;
  feature: {
    phase: FeaturePhase;
    source: "hammurapi" | "repository";
    title: string;
    release: string | null;
    releasedAt: string | null;
    indexedAt: string | null;
    parent: string | null;
    issues: { key: string; title: string; url: string }[];
    pullRequests: SpecPR[];
    /** Links with other features (FTR.HMR.DEV-0002 R14); absent with an older core. */
    links?: SpecFeatureLinks;
  };
}

/** The other end of a link; title is null outside the index (FTR.HMR.DEV-0002 R17). */
export interface SpecLinkRef {
  key: string;
  title: string | null;
  indexed: boolean;
  requirements: string[];
  /** FTR.HMR.DEV-0003 R15: the layer of the link and the new name of requirements; absent in an older core. */
  layer?: "product" | "arch";
  items?: string[];
}

/** The document contract of the rules (FTR.HMR.DEV-0003 R17–R20). */
export interface ContractElement {
  element: string;
  title: string;
  example: string;
}

export interface RulesContract {
  lang: string;
  alsoRead: string[];
  template: ContractElement[];
  fixTemplate: ContractElement[];
}

export interface ContractViolation {
  element: string;
  message: string;
}

export interface RulesViolation {
  area: Area;
  file: "template" | "fix-template";
  sha: string;
  violations: ContractViolation[];
}

/** A layer of the links of a feature in work, from the documents of its branch (FTR.HMR.DEV-0003 R6). */
export interface DraftLinkRef {
  key: string;
  title: string | null;
  indexed: boolean;
  items: string[];
}

export interface DraftLayer {
  layer: "product" | "arch";
  state: "draft" | "approved" | "skipped";
  extends: DraftLinkRef[];
  changes: DraftLinkRef[];
}

export interface SpecFeatureLinks {
  extends: SpecLinkRef[];
  changes: SpecLinkRef[];
  extendedBy: SpecLinkRef[];
  changedBy: SpecLinkRef[];
}

/** GET /api/v1/spec/graph (FTR.HMR.DEV-0002 tech §2.3). */
export interface SpecGraphNode {
  key: string;
  title: string | null;
  domain: string;
  system: string;
  phase: FeaturePhase | null;
  indexed: boolean;
  context: boolean;
}

export type SpecLinkKind = "extends" | "changes";

export interface SpecGraphEdge {
  source: string;
  target: string;
  kind: SpecLinkKind;
  requirements: string[];
  /** The layer of the link (FTR.HMR.DEV-0003 R15); absent in an older core — product. */
  layer?: "product" | "arch";
}

export interface SpecGraphData {
  commit: string;
  nodes: SpecGraphNode[];
  edges: SpecGraphEdge[];
}

export type SpecChangeReason = "unknown_target" | "target_in_work" | "unknown_requirement" | "unknown_decision" | "wrong_kind";

/** A row of the block "Changes to other features" (FTR.HMR.DEV-0002 tech §2.1). */
export interface SpecChangeItem {
  feature: string;
  /** R<n> of product or A<n> of arch, null for the whole feature (FTR.HMR.DEV-0003); absent in an older core. */
  item?: string | null;
  kind?: "requirement" | "decision";
  /** The old name of item. */
  requirement: string | null;
  note: string;
  state: "marked" | "pending" | "error";
  url: string;
  error?: { feature: string; requirement?: string; reason: SpecChangeReason };
}

export interface SpecFile {
  path: string;
  name: string;
  size: number;
  mimeType: string;
  previewable: boolean;
  /** The file as a page of its own in an opaque origin; absent in older cores (FTR.HMR.SPEC-0001 R6). */
  viewUrl?: string;
}

/** The text of a requirement, a decision or the header of a document of the index (FTR.HMR.DEV-0003 R8). */
export interface SpecItemText {
  key: string;
  item: string;
  kind: "requirement" | "decision" | "header";
  markdown: string;
  url: string;
}

/** A file of the folder of a gate in the branch of a feature (FTR.HMR.DEV-0003 R1). */
export interface GateFile {
  name: string;
  size: number;
  mimeType: string;
  blobSha: string;
  previewable: boolean;
  viewUrl?: string;
}

export interface GateFiles {
  ref: string;
  files: GateFile[];
}

/** GET /features/{id}/discovery: the Discovery document and the materials beside it (FTR.HMR.DISC-0001 tech §3.6). */
export interface FeatureDiscovery {
  ref: string;
  document: { path: string; markdown: string; blobSha: string } | null;
  files: GateFile[];
}

export interface SpecSearchItem {
  featureKey: string;
  featureTitle: string;
  area: SpecArea;
  path: string;
  section: string;
  snippet: string;
  rank: number;
}

export interface SpecSearchResult {
  total: number;
  items: SpecSearchItem[];
  nextCursor: string | null;
}

export type SpecScanInterval = "15m" | "30m" | "1h" | "3h" | "6h" | "12h" | "24h";
export const SPEC_SCAN_INTERVALS: SpecScanInterval[] = ["15m", "30m", "1h", "3h", "6h", "12h", "24h"];

export interface SpecScanSettings {
  interval: SpecScanInterval;
  branch: string;
}

export interface SpecScanRun {
  id: string;
  trigger: "schedule" | "manual" | "catalog" | "push";
  status: "queued" | "running" | "succeeded" | "failed";
  commit: string | null;
  startedAt: string | null;
  durationMs: number | null;
  found: number | null;
  indexed: number | null;
  issues: number | null;
  error: string | null;
  createdAt: string;
}

export type SpecIssueKind = "old_format" | "bad_format" | "key_path_mismatch" | "missing_domain" | "missing_system" | "missing_parent" | "deleted";

export interface SpecIndexIssue {
  id: string;
  path: string;
  featureKey: string | null;
  kind: SpecIssueKind;
  details: Record<string, unknown>;
  firstSeenAt: string;
  lastSeenAt: string;
  resolvedAt: string | null;
}

export interface MissingCatalog {
  catalogSource: "manual" | "backstage";
  items: { domain: string; domainExists: boolean; system: string; features: string[]; catalogInfoExample?: string }[];
}

// ─── Nabu (FTR.HMR.CMN-0006) ─────────────────────────────────────────

export type NabuTone = "business" | "friendly" | "brief" | "mentor";

/** A model the agent of Nabu can run on (FTR.NAB.CHAT-0001 R16), as Nabu gives it. */
export interface NabuModel {
  connectionId: string;
  model: string;
  name: string;
  connection: string;
  caps: { image: boolean; tools: boolean; reasoning: boolean; contextWindow: number };
}

/** GET /client/v1/me/agent of Nabu, proxied as /api/v1/agent (FTR.NAB.CHAT-0001 tech §2.2). */
export interface NabuAgent {
  name: string;
  tone: NabuTone;
  model: NabuModel | null;
  defaultModel?: NabuModel | null;
  /** The user chose the model; false — the default one. */
  chosen?: boolean;
  availableModels?: NabuModel[];
  /** The fill of the context of the main conversation. */
  context?: { tokens: number; window: number };
  /** Documents and spreadsheets open in the preview (FTR.HMR.CMN-0007 R26). */
  previewOffice?: boolean;
}

/** The sheets of a preview of a spreadsheet (FTR.NAB.CHAT-0003 tech §8.1). */
export interface PreviewSheets {
  sheets: {
    name: string;
    rows: number;
    cols: number;
    cells: { v?: string; n?: number; f?: string }[][];
    merges: string[];
    freeze: string;
  }[];
}

export interface NabuConversation {
  id: string;
  kind: "main" | "topic";
  title: string | null;
  lastMessageAt: string | null;
  archivedAt: string | null;
  createdAt: string;
}

export interface NabuToolStep {
  id: string;
  server: string;
  tool: string;
  summary: string;
  status: "running" | "done" | "error";
  /** The tasks of a call of subagents (FTR.NAB.CMN-0009 R8). */
  subagents?: ChatSubagent[];
}

/** A turn waiting for the pod of the agent in Nabu (FTR.NAB.CMN-0004 tech §2). */
export interface NabuAgentWait {
  conversationId: string;
  messageId: string;
  state: "starting" | "queued";
  position?: number;
}

export interface NabuMessage {
  id: string;
  conversationId: string;
  role: "user" | "assistant" | "notice";
  text: string;
  channel: string;
  /** FTR.NAB.CHAT-0002: the product that wrote a notice and its data. */
  clientName?: string | null;
  payload?: Record<string, unknown> | null;
  /** `stopped`: the user stopped the answer (FTR.NAB.CHAT-0004 R9). */
  status: "pending" | "streaming" | "done" | "failed" | "stopped";
  /** A user message waiting in the queue for its answer (FTR.NAB.CHAT-0004 R1). */
  queued?: boolean;
  replyTo?: string | null;
  attachments: { id: string; fileName: string; mimeType: string; size?: number }[];
  toolSteps: NabuToolStep[];
  context?: { type: string; key: string; area?: string } | null;
  errorClass: string | null;
  errorText: string | null;
  createdAt: string;
}

/** A row of the binding (FTR.HMR.CMN-0007 R14): code — the agent needs the sandbox of Nabu. */
export interface NabuScenarioRow { name: string; code: boolean }

export interface NabuSettingsView {
  connected: boolean;
  url: string;
  client: string;
  /** FTR.HMR.CMN-0007 tech §3.3: the sandbox of an agent, for the warnings of code scenarios. */
  agents: { name: string; description: string; workspace: string; workspaceProfile?: string; proxies?: string[] }[];
  scenarios: Record<string, string>;
  /** The scenarios of the binding in order; the web keeps no list. */
  scenarioRows: NabuScenarioRow[];
  error?: string;
  /** FTR.HMR.CMN-0007 tech §6: the last answer of Nabu this instance got. */
  lastOkAt?: string;
}

export interface UnlinkedUser {
  user: { id: string; name: string; email: string | null; createdAt: string };
  candidates: { userId: string; name: string; gitLogin: string | null; emails: string[] }[];
}

/** A violation of the contract in 422 spec_contract (FTR.HMR.SPEC-0004 tech §3.1). */
export interface ContractViolation {
  check: string;
  subject?: string;
  message: string;
  line?: number;
  file?: string;
  suggest?: string;
}
