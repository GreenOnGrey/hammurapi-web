/** Admin sections; links use absolute paths: React Router 7 resolves relative
 * links in the `admin/*` splat route against the whole URL, so "domains" from
 * /admin/users would lead to /admin/users/domains. */
export const ADMIN_SECTIONS = ["users", "domains", "services", "rules", "cycle", "deploy", "metrics", "settings", "nabu",
  "agent/connections", "agent/models", "agent/skills", "agent/mcp", "agent/usage"] as const;
export type AdminSection = (typeof ADMIN_SECTIONS)[number];

/** Subsections of the Agent section (FTR.HMR.CMN-0004 design §2). */
export const AGENT_SECTIONS = ["agent/connections", "agent/models", "agent/skills", "agent/mcp", "agent/usage"] as const;

export const adminPath = (s: AdminSection) => `/admin/${s}`;
