// FTR.HMR.DEV-0004 R4–R7, R4a, R11, design §3.2–§3.3: the icon of the cost of a gate, a service or the feature
// and its popover — the total, tokens by kind and the runs of the agent with their reasons and logs.
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "@green-on-grey/ui-kit";
import { useFeatureCost } from "../../api/queries";
import type { CostItem, CostRun, CostSum } from "../../api/types";
import { costDetail, costItemLabel as itemLabel, money, tokensFull, tokensShort, tokensTotal } from "../../lib/cost";
import { dateTime } from "../../lib/format";
import { useRunLog } from "./RunLog";

type Subject = { kind: CostItem["kind"]; key: string | null };

const same = (it: CostItem, s: Subject) => it.kind === s.kind && (it.key ?? null) === s.key;

function subjectTitle(t: (k: string, o?: Record<string, unknown>) => string, s: Subject | null, featureId: string, withAreas = false): string {
  return s ? itemLabel(t, s, withAreas) : featureId;
}

const hasAreas = (items: CostItem[] | undefined) => !!items?.some((it) => it.kind === "area");

/** The icon of the cost; no runs — no icon (design §1). subject null — the whole feature (R7). */
export function CostButton({ featureId, subject, align = "start" }: { featureId: string; subject: Subject | null; align?: "start" | "end" }) {
  const { t, i18n } = useTranslation();
  const cost = useFeatureCost(featureId);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("keydown", esc); };
  }, [open]);
  const data = cost.data;
  if (!data) return null;
  const sum: CostSum | undefined = subject ? data.items.find((it) => same(it, subject)) : data.total;
  if (!sum || sum.runs === 0) return null;
  const label = t("cost.button", { amount: money(sum.costUsd, i18n.language) });
  return (
    <span className={`cost-anchor ${align}`} ref={ref}>
      <button className="btn ghost sm cost-btn" title={label} aria-label={label} aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <Icon name="coins" size={16} />
      </button>
      {open && <CostPopover featureId={featureId} subject={subject} canViewLog={data.canViewLog} onClose={() => setOpen(false)} />}
    </span>
  );
}

function Total({ sum }: { sum: CostSum }) {
  const { t, i18n } = useTranslation();
  const lng = i18n.language;
  return (
    <div>
      <div className="cost-total">{money(sum.costUsd, lng)}</div>
      <div className="small muted" title={tokensFull(tokensTotal(sum.tokens), lng)}>
        {t("cost.runs", { count: sum.runs, tokens: tokensShort(tokensTotal(sum.tokens), lng) })}
      </div>
      {sum.unknownRuns > 0 && <div className="small muted">{t("cost.withoutUnknown", { count: sum.unknownRuns })}</div>}
      {sum.running > 0 && <div className="small muted">{t("cost.running", { count: sum.running })}</div>}
    </div>
  );
}

function CostPopover({ featureId, subject, canViewLog, onClose }: { featureId: string; subject: Subject | null; canViewLog: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const [picked, setPicked] = useState<Subject | null>(subject);
  const detail = picked ? costDetail(picked.kind, picked.key) : undefined;
  const all = useFeatureCost(featureId);
  const one = useFeatureCost(featureId, detail, !!detail);
  const item = picked ? one.data?.items.find((it) => same(it, picked)) : undefined;
  const withAreas = hasAreas(all.data?.items);
  return (
    <div className="cost-pop" role="dialog" aria-label={t("cost.title", { subject: subjectTitle(t, picked, featureId, withAreas) })}>
      <div className="cost-pop-h">
        {!subject && picked && (
          <button className="btn ghost sm" onClick={() => setPicked(null)}><Icon name="back" size={14} />{t("cost.back")}</button>
        )}
        <b className="grow">{t("cost.title", { subject: subjectTitle(t, picked, featureId, withAreas) })}</b>
        <button className="btn ghost sm" aria-label={t("common.close")} onClick={onClose}><Icon name="x" size={14} /></button>
      </div>
      <div className="cost-pop-b">
        {!picked && all.data && <FeatureTable sum={all.data.total} items={all.data.items} onPick={setPicked} />}
        {picked && one.isLoading && <div className="small muted">{t("common.loading")}</div>}
        {picked && one.isError && <div className="small err-text">{t("cost.error")}</div>}
        {picked && item && <ItemDetail item={item} canViewLog={canViewLog} />}
        <div className="small muted">{t("cost.priceSource")}</div>
      </div>
    </div>
  );
}

function FeatureTable({ sum, items, onPick }: { sum: CostSum; items: CostItem[]; onPick: (s: Subject) => void }) {
  const { t, i18n } = useTranslation();
  return (
    <>
      <Total sum={sum} />
      <table className="cost-items">
        <tbody>
          {items.map((it) => (
            <tr key={it.kind + (it.key ?? "")} className="click" onClick={() => onPick({ kind: it.kind, key: it.key })}>
              <td>{itemLabel(t, { kind: it.kind, key: it.key }, hasAreas(items))}</td>
              <td className="num">{it.runs}</td>
              <td className="num">{it.unknownRuns === it.runs ? t("cost.unknownPrice") : money(it.costUsd, i18n.language)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

function ItemDetail({ item, canViewLog }: { item: CostItem; canViewLog: boolean }) {
  const { t, i18n } = useTranslation();
  const lng = i18n.language;
  return (
    <>
      <Total sum={item} />
      <div className="cost-kinds">
        {(["in", "out", "cacheRead", "cacheWrite"] as const).map((k) => (
          <div key={k} className="row"><span className="grow">{t(`cost.kind.${k}`)}</span><span className="num">{tokensFull(item.tokens[k], lng)}</span></div>
        ))}
      </div>
      <div className="small muted">{t("cost.cacheHint")}</div>
      <div className="cost-runs">{(item.list ?? []).map((r) => <RunRow key={r.id} r={r} canViewLog={canViewLog} />)}</div>
    </>
  );
}

function RunRow({ r, canViewLog }: { r: CostRun; canViewLog: boolean }) {
  const { t, i18n } = useTranslation();
  const lng = i18n.language;
  const [full, setFull] = useState(false);
  const openLog = useRunLog();
  const short = (x: CostRun["tokens"]) =>
    t("cost.tokensLine", { in: tokensShort(x.in, lng), out: tokensShort(x.out, lng), read: tokensShort(x.cacheRead, lng), write: tokensShort(x.cacheWrite, lng) });
  return (
    <div className="cost-run">
      <div className="row">
        <span className="small num">{dateTime(r.at, lng)}</span>
        {r.reason && <span className="chip-s">{t(`cost.reason.${r.reason}`, { defaultValue: r.reason })}</span>}
        {(r.status === "failed" || r.status === "cancelled") && <span className="chip-s bad">{t(`cost.status.${r.status}`)}</span>}
        {r.status === "running" && <span className="chip-s">{t("log.live")}</span>}
        {r.shared && <button className="chip-s share" onClick={() => setFull((v) => !v)}>{t("cost.shared", { areas: r.shared.areas.join(", ") })}</button>}
        {r.model && r.model !== "nabu" && <span className="mono small muted">{r.model}</span>}
        <span className="grow" />
        {r.costUsd === null ? <span className="small muted">{t("cost.unknownPrice")}</span> : <b className="num">{money(r.costUsd, lng)}</b>}
      </div>
      <div className="row small muted">
        <span className="grow">{short(r.tokens)}</span>
        {canViewLog && r.runId && (
          <button className="btn ghost sm" disabled={!r.logAvailable} title={r.logAvailable ? t("log.open") : t("log.unavailable")}
            aria-label={r.logAvailable ? t("log.open") : t("log.unavailable")} onClick={() => openLog({ runId: r.runId! })}>
            <Icon name="terminal" size={15} />
          </button>
        )}
      </div>
      {full && r.shared && (
        <div className="cost-full small">
          {t("cost.wholeRun", { amount: r.shared.costUsd === null ? t("cost.unknownPrice") : money(r.shared.costUsd, lng), areas: r.shared.areas.join(", ") })}
          {" · "}{short(r.shared.tokens)}
        </div>
      )}
    </div>
  );
}
