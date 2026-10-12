import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { FeaturePhase, IssueType } from "../api/types";
import { Icon } from "@green-on-grey/ui-kit";

/** Link of an entity key: ISS → issue, FTR → feature, RLS → release. */
export function keyHref(key: string): string {
  if (key.startsWith("ISS.")) return `/issues/${key}`;
  if (key.startsWith("RLS.")) return `/releases/${key}`;
  return `/features/${key}`;
}

/** Monospace key plaque (design spec §1). */
export function KeyLink({ k, plain }: { k: string; plain?: boolean }) {
  if (plain) return <span className="fid">{k}</span>;
  return <Link className="fid" to={keyHref(k)} onClick={(e) => e.stopPropagation()}>{k}</Link>;
}

export function KeyList({ keys, plain }: { keys: string[]; plain?: boolean }) {
  if (!keys.length) return null;
  return <span className="keys">{keys.map((k) => <KeyLink key={k} k={k} plain={plain} />)}</span>;
}

export function IssueTypeBadge({ type }: { type: IssueType }) {
  const { t } = useTranslation();
  return (
    <span className={`ty ${type}`}>
      <Icon name={type === "idea" ? "bulb" : "bug"} size={12} />
      {t(`issueType.${type}`)}
    </span>
  );
}

/** Everything the agent wrote carries the same mark (design spec §4). */
export function AgentMark() {
  const { t } = useTranslation();
  return <span className="agentmark">{t("common.agent")}</span>;
}

export function IssueStatusBadge({ status }: { status: string }) {
  const { t } = useTranslation();
  const cls = { new: "draft", discovery: "disc", verification: "in_review", accepted: "approved", resolved: "approved", rejected: "no", merged: "no" }[status] ?? "draft";
  return <span className={`st ${cls}`}>{t(`issueStatus.${status}`)}</span>;
}

export function PhaseBadge({ phase }: { phase: FeaturePhase | string }) {
  const { t } = useTranslation();
  const cls = { spec: "draft", codegen: "disc", validation: "in_review", in_release: "handed", released: "approved", rolled_back: "no", deleted: "no", indexed: "none" }[phase] ?? "draft";
  return <span className={`st ${cls}`}>{t(`phase.${phase}`)}</span>;
}

export function ReleaseStatusBadge({ status, blocked }: { status: string; blocked?: boolean }) {
  const { t } = useTranslation();
  if (blocked) return <span className="st blocked">{t("release.blocked")}</span>;
  const cls = { succeeded: "approved", rolled_back: "no", rolling_back: "blocked", awaiting_confirmation: "in_review" }[status] ?? "disc";
  return <span className={`st ${cls}`}>{t(`releaseStatus.${status}`)}</span>;
}

export interface LaneItem {
  key: string;
  label: ReactNode;
  sub?: ReactNode;
  state: "done" | "now" | "later" | "failed";
}

/** Path of a feature and steps of a release: done green, current framed, future dashed. */
export function Lane({ items }: { items: LaneItem[] }) {
  return (
    <div className="lane" style={{ gridTemplateColumns: `repeat(${items.length}, 1fr)` }}>
      {items.map((i) => (
        <div key={i.key} className={i.state}>
          {i.sub && <span>{i.sub}</span>}
          <b>{i.label}</b>
        </div>
      ))}
    </div>
  );
}

export function Progress({ done, total }: { done: number; total: number }) {
  const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
  return <div className="progress" aria-label={`${done}/${total}`}><i style={{ width: `${pct}%` }} /></div>;
}

export function Kpi({ items }: { items: { value: ReactNode; label: ReactNode }[] }) {
  return (
    <div className="kpi">
      {items.map((x, i) => <div key={i}><b>{x.value}</b><span>{x.label}</span></div>)}
    </div>
  );
}

export function Dot({ tone }: { tone: "g" | "a" | "r" | "n" }) {
  return <i className={`dot ${tone}`} aria-hidden="true" />;
}
