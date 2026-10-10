import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useDomains, useReleases } from "../api/queries";
import { useChatContext } from "../app/session";
import { relativeTime } from "../lib/format";
import { Empty, Loading } from "../components/ui";
import { KeyLink, ReleaseStatusBadge } from "../components/cycle";

/** Delivery: releases with the current step and the result (design spec §3.5). */
export function ReleasesPage() {
  const { t, i18n } = useTranslation();
  const chat = useChatContext();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const domain = params.get("domain") ?? "mine";
  const status = params.get("status") ?? "active";
  const domains = useDomains();
  const releases = useReleases({ domain, status });
  const { setSubject } = chat;
  useEffect(() => setSubject(null), [setSubject]);
  const set = (k: string, v: string) => {
    const n = new URLSearchParams(params);
    n.set(k, v);
    setParams(n, { replace: true });
  };
  return (
    <main className="main">
      <h1 className="page-h">{t("stages.delivery")}</h1>
      <div className="filters">
        <div className="chips" role="group" aria-label={t("home.domains")}>
          <span className="lbl">{t("home.domains")}</span>
          {["mine", "all"].map((d) => <button key={d} className={`chip${domain === d ? " on" : ""}`} onClick={() => set("domain", d)}>{t(`home.domain.${d}`)}</button>)}
          {domains.data?.map((d) => <button key={d.key} className={`chip${domain === d.key ? " on" : ""}`} onClick={() => set("domain", d.key)}>{d.key}</button>)}
        </div>
        <div className="chips" role="group" aria-label={t("home.status")}>
          <span className="lbl">{t("home.status")}</span>
          {["active", "succeeded", "rolled_back", "all"].map((s) => <button key={s} className={`chip${status === s ? " on" : ""}`} onClick={() => set("status", s)}>{t(`releases.filter.${s}`)}</button>)}
        </div>
      </div>
      {releases.isLoading && <Loading />}
      {releases.data?.items.length === 0 && <Empty icon="rocket" title={t("releases.empty")}>{t("releases.emptyHint")}</Empty>}
      {!!releases.data?.items.length && (
        <div className="table">
          {releases.data.items.map((r) => (
            <div key={r.key} className="trow release" role="link" tabIndex={0}
              onClick={() => navigate(`/releases/${r.key}`)} onKeyDown={(e) => e.key === "Enter" && navigate(`/releases/${r.key}`)}>
              <span><KeyLink k={r.key} /></span>
              <span><KeyLink k={r.feature} /></span>
              <span className="ellipsis">{r.featureTitle}</span>
              <span><ReleaseStatusBadge status={r.status} blocked={!!r.blockedReason} /></span>
              <span className="small muted">{relativeTime(r.createdAt, i18n.language)}</span>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
