import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useDomains, useIssues } from "../api/queries";
import { useChatContext } from "../app/session";
import { relativeTime } from "../lib/format";
import { Icon } from "../components/Icon";
import { Empty, Loading } from "../components/ui";
import { IssueStatusBadge, IssueTypeBadge, KeyLink, KeyList } from "../components/cycle";
import { NewIssueModal } from "./NewIssue";

/** Discovery stage: the list of issues (design spec §3.3). */
export function IssuesPage() {
  const { t, i18n } = useTranslation();
  const chat = useChatContext();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [creating, setCreating] = useState(false);
  const f = {
    domain: params.get("domain") ?? "mine",
    type: params.get("type") ?? "",
    status: params.get("status") ?? "open",
    q: params.get("q") ?? "",
  };
  const domains = useDomains();
  const issues = useIssues(f);
  const { setSubject } = chat;
  useEffect(() => setSubject(null), [setSubject]);
  const set = (k: string, v: string) => {
    const n = new URLSearchParams(params);
    if (v) n.set(k, v);
    else n.delete(k);
    setParams(n, { replace: true });
  };
  return (
    <main className="main">
      <h1 className="page-h">{t("stages.research")}</h1>
      <div className="filters">
        <div className="chips" role="group" aria-label={t("home.domains")}>
          <span className="lbl">{t("home.domains")}</span>
          {["mine", "all"].map((d) => <button key={d} className={`chip${f.domain === d ? " on" : ""}`} onClick={() => set("domain", d)}>{t(`home.domain.${d}`)}</button>)}
          {domains.data?.map((d) => <button key={d.key} className={`chip${f.domain === d.key ? " on" : ""}`} onClick={() => set("domain", d.key)}>{d.key}</button>)}
        </div>
        <div className="chips" role="group" aria-label={t("issues.type")}>
          <span className="lbl">{t("issues.type")}</span>
          {["", "idea", "problem"].map((x) => <button key={x} className={`chip${f.type === x ? " on" : ""}`} onClick={() => set("type", x)}>{x ? t(`issueType.${x}`) : t("home.domain.all")}</button>)}
        </div>
        <div className="chips" role="group" aria-label={t("home.status")}>
          <span className="lbl">{t("home.status")}</span>
          {["open", "accepted", "resolved", "closed", "all"].map((x) => <button key={x} className={`chip${f.status === x ? " on" : ""}`} onClick={() => set("status", x)}>{t(`issues.filter.${x}`)}</button>)}
        </div>
      </div>
      {issues.isLoading && <Loading />}
      {issues.data?.items.length === 0 && (
        <Empty icon="bulb" title={t("issues.empty")}>
          {t("issues.emptyHint")}
          <div className="acts"><button className="btn primary sm" onClick={() => setCreating(true)}><Icon name="plus" />{t("top.newIssue")}</button></div>
        </Empty>
      )}
      {!!issues.data?.items.length && (
        <div className="table">
          {issues.data.items.map((is) => (
            <div key={is.key} className="trow issue" role="link" tabIndex={0}
              onClick={() => navigate(`/issues/${is.key}`)} onKeyDown={(e) => e.key === "Enter" && navigate(`/issues/${is.key}`)}>
              <span><KeyLink k={is.key} /></span>
              <span><IssueTypeBadge type={is.type} /></span>
              <span className="ellipsis">{is.title}</span>
              <span className="row">
                <IssueStatusBadge status={is.status} />
                {is.rolledBackRelease && <span className="small t2"><Icon name="undo" size={12} /> <KeyList keys={[is.rolledBackRelease]} /></span>}
                {is.mergedInto && <span className="small t2">→ <KeyList keys={[is.mergedInto]} /></span>}
              </span>
              <span className="small muted">{t(`issueSource.${is.source}`)} · {relativeTime(is.createdAt, i18n.language)}</span>
            </div>
          ))}
        </div>
      )}
      {creating && <NewIssueModal onClose={() => setCreating(false)} />}
    </main>
  );
}
