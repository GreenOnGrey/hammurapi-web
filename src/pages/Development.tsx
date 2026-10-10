import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useApprovals, useDomains, useFeatures } from "../api/queries";
import { AREAS, type FeatureSummary } from "../api/types";
import { useChatContext, useSession } from "../app/session";
import { duration } from "../lib/format";
import { Icon } from "../components/Icon";
import { Empty, Loading } from "../components/ui";
import { KeyLink, KeyList, PhaseBadge } from "../components/cycle";
import { ImportUploadModal } from "./Import";

/** Development: features by domain / system with phase and issues (design spec §3.4). */
export function DevelopmentPage() {
  const { t, i18n } = useTranslation();
  const { isAnyExpert } = useSession();
  const chat = useChatContext();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [importing, setImporting] = useState(false);
  const domain = params.get("domain") ?? "mine";
  const phase = params.get("phase") ?? "";
  const status = params.get("status") ?? "active";
  const q = params.get("q") ?? "";
  const approvals = useApprovals(isAnyExpert);
  const domains = useDomains();
  const features = useFeatures({ domain, phase, status, q });

  const { setSubject } = chat;
  useEffect(() => setSubject(null), [setSubject]);

  const setFilter = (k: string, v: string) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    setParams(next, { replace: true });
  };

  const groups = useMemo(() => {
    const m = new Map<string, FeatureSummary[]>();
    for (const f of features.data?.items ?? []) {
      const k = `${f.domain} / ${f.system}`;
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(f);
    }
    return [...m.entries()].toSorted(([a], [b]) => a.localeCompare(b));
  }, [features.data]);

  return (
    <main className="main">
      <div className="row" style={{ marginBottom: 6 }}>
        <h1 className="page-h grow" style={{ margin: 0 }}>{t("stages.development")}</h1>
        {isAnyExpert && (
          <button className="btn sm" onClick={() => setImporting(true)}><Icon name="upload" />{t("top.import")}</button>
        )}
      </div>
      {isAnyExpert && !!approvals.data?.items.length && (
        <section className="approvals" aria-labelledby="approvals-h">
          <div className="head">
            <h2 className="sec" id="approvals-h" style={{ margin: 0 }}>
              {t("home.awaiting")}<span className="count">{approvals.data.items.length}</span>
            </h2>
          </div>
          {approvals.data.items.map((a) => (
            <div key={`${a.uniqueId}-${a.area}`} className="it" role="link" tabIndex={0} onClick={() => navigate(`/features/${a.uniqueId}/spec/${a.area}`)}>
              <span><KeyLink k={a.uniqueId} plain /></span>
              <span>{a.title}</span>
              <span className="small t2">{t(`areas.${a.area}`)}</span>
              <span className="small t2">{a.submittedBy ?? ""}</span>
              <span className="small muted"><Icon name="clock" size={14} /> {duration(a.submittedAt, i18n.language)}</span>
            </div>
          ))}
        </section>
      )}

      <div className="filters">
        <div className="chips" role="group" aria-label={t("home.domains")}>
          <span className="lbl">{t("home.domains")}</span>
          {["mine", "all"].map((d) => (
            <button key={d} className={`chip${domain === d ? " on" : ""}`} onClick={() => setFilter("domain", d)}>{t(`home.domain.${d}`)}</button>
          ))}
          {domains.data?.map((d) => (
            <button key={d.key} className={`chip${domain === d.key ? " on" : ""}`} onClick={() => setFilter("domain", d.key)} title={d.name}>{d.key}</button>
          ))}
        </div>
        <div className="chips" role="group" aria-label={t("development.phase")}>
          <span className="lbl">{t("development.phase")}</span>
          {["", "spec", "codegen", "validation"].map((p) => (
            <button key={p} className={`chip${phase === p ? " on" : ""}`} onClick={() => setFilter("phase", p)}>{p ? t(`phase.${p}`) : t("home.domain.all")}</button>
          ))}
        </div>
        <div className="chips" role="group" aria-label={t("home.status")}>
          <span className="lbl">{t("home.status")}</span>
          {["active", "released", "rolled_back", "all"].map((s) => (
            <button key={s} className={`chip${status === s ? " on" : ""}`} onClick={() => setFilter("status", s)}>{t(`development.status.${s}`)}</button>
          ))}
        </div>
        {q && (
          <span className="chip on">
            {t("home.searching", { q })}
            <button className="iconbtn" style={{ width: 18, height: 18 }} aria-label={t("common.clear")} onClick={() => setFilter("q", "")}>
              <Icon name="x" size={12} />
            </button>
          </span>
        )}
      </div>

      {features.isLoading && <Loading />}
      {features.data?.items.length === 0 && (
        <Empty icon="grid" title={t("development.empty")}>
          {t("development.emptyHint")}
        </Empty>
      )}
      {groups.map(([group, items]) => (
        <section key={group}>
          <h3 className="group-h">{group}</h3>
          {items.map((f) => <FeatureRow key={f.uniqueId} f={f} />)}
        </section>
      ))}
      {importing && <ImportUploadModal onClose={() => setImporting(false)} />}
    </main>
  );
}

function FeatureRow({ f }: { f: FeatureSummary }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const byArea = new Map(f.gates.map((g) => [g.area, g]));
  return (
    <div className="frow" role="link" tabIndex={0} onClick={() => navigate(`/features/${f.uniqueId}`)}
      onKeyDown={(e) => e.key === "Enter" && navigate(`/features/${f.uniqueId}`)}>
      <span><KeyLink k={f.uniqueId} plain /></span>
      <span className="title">
        <span>{f.title}</span>
        {f.parent && <span className="tag-fix">fix</span>}
        {f.isProblem && <span className="ty problem">{t("issueType.problem")}</span>}
        {f.imported && <span className="tag-fix">{t("development.imported")}</span>}
        <KeyList keys={f.issues} />
      </span>
      <span><PhaseBadge phase={f.phase} /></span>
      <span className="minigates" aria-hidden="true">
        {AREAS.filter((a) => byArea.has(a)).map((a) => <i key={a} className={f.approvalRequired ? byArea.get(a)!.status : "draft"} />)}
      </span>
    </div>
  );
}
