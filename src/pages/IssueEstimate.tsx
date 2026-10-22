import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { Icon, Modal } from "@green-on-grey/ui-kit";
import { api } from "../api/client";
import { invalidateCycle, keys } from "../api/queries";
import type { DiscoveryView, Estimate, EstimateConfidence, EstimatePeopleStage, EstimateTotals, Expertise, IssueCard } from "../api/types";
import { errorText } from "../lib/errors";
import { KeyLink } from "../components/cycle";

// FTR.HMR.DISC-0001 R15–R18, design §3.6–3.7: the draft estimate of the work —
// agents do it, people take part.

const AGENT_STAGES = ["spec", "codegen", "checks"] as const;
const PEOPLE_STAGES: EstimatePeopleStage[] = ["spec", "approval", "validation", "release"];
const EXPERTISES: Expertise[] = ["product", "tech"];
const CONFIDENCES: EstimateConfidence[] = ["high", "medium", "low"];

/** The class of the badge of a confidence: low is not an error (design decision 6). */
const CONF_CLASS: Record<EstimateConfidence, string> = { high: "approved", medium: "in_review", low: "none" };

export const usd = (v: number) => `$${Math.round(v).toLocaleString("en")}`;
const num = (v: number, lng: string) => v.toLocaleString(lng, { maximumFractionDigits: 1 });

/** «≈ $40 агента · 12 чел/ч · 9 дней» (R17). */
export function estimateLine(t: TFunction, e: EstimateTotals, lng: string): string {
  return t("disc.est.line", { usd: usd(e.agentUsd), hours: num(e.personHours, lng), days: e.days });
}

export function ConfidenceBadge({ c }: { c: EstimateConfidence }) {
  const { t } = useTranslation();
  return <span className={`st ${CONF_CLASS[c]}`}>{t(`disc.est.confidence.${c}`)}</span>;
}

/** The summary of the estimate in the header of the issue: a click opens the block. */
export function EstimateChip({ d, onOpen }: { d?: DiscoveryView; onOpen: () => void }) {
  const { t, i18n } = useTranslation();
  if (!d?.estimateTotals) return null;
  return (
    <button type="button" className="estchip" onClick={onOpen}>
      {estimateLine(t, d.estimateTotals, i18n.language)} <ConfidenceBadge c={d.estimateTotals.confidence} />
    </button>
  );
}

export function EstimateBlock({ is, d, open, setOpen, canEdit }: {
  is: IssueCard; d: DiscoveryView; open: boolean; setOpen: (v: boolean) => void; canEdit: boolean;
}) {
  const { t, i18n } = useTranslation();
  const [editing, setEditing] = useState(false);
  const e = d.estimate;
  const tot = d.estimateTotals;
  const lng = i18n.language;
  return (
    <section className="docsec" id="estimate">
      {e && tot ? (
        <button type="button" className="estline" aria-expanded={open} onClick={() => setOpen(!open)}>
          <b>{t("disc.est.title")}</b>
          <span className="estgrow small t2">{open ? "" : estimateLine(t, tot, lng)}</span>
          <ConfidenceBadge c={tot.confidence} />
          <Icon name="chevrons" size={16} />
        </button>
      ) : (
        <div className="estline" style={{ cursor: "default" }}>
          <b>{t("disc.est.title")}</b>
          <span className="estgrow small muted">{t("disc.est.none")}</span>
          {canEdit && <button className="btn sm" onClick={() => setEditing(true)}><Icon name="plus" size={14} />{t("disc.est.add")}</button>}
        </div>
      )}
      {e && tot && open && (
        <>
          {canEdit && <div className="row" style={{ justifyContent: "flex-end", marginTop: 6 }}>
            <button className="btn ghost sm" onClick={() => setEditing(true)}><Icon name="edit" size={14} />{t("disc.est.edit")}</button>
          </div>}
          <div className="estgrid">
            <div>
              <h6>{t("disc.est.agent")}</h6>
              <table className="cov">
                <tbody>
                  {e.agent.map((a) => <tr key={a.stage}><td>{t(`disc.est.stage.${a.stage}`)}</td><td className="num">{usd(a.usd)} · {tokens(a.tokens, lng)}</td></tr>)}
                  <tr className="tot"><td>{t("disc.est.total")}</td><td className="num">{usd(tot.agentUsd)} · {tokens(tot.agentTokens ?? 0, lng)}</td></tr>
                </tbody>
              </table>
            </div>
            <div>
              <h6>{t("disc.est.people")}</h6>
              <PeopleTable e={e} lng={lng} />
            </div>
          </div>
          <div className="estfoot">
            <div>
              <div className="muted small">{t("disc.est.term")}</div>
              <b>{t("disc.est.days", { count: e.days })}</b>
              <div className="muted small">{t("disc.est.wait", { count: e.waitDays })}</div>
            </div>
            <div>
              <div className="muted small">{t("disc.est.basis")}</div>
              {e.basis.features.length > 0 ? e.basis.features.map((k) => <span key={k}><KeyLink k={k} /> </span>) : t("disc.est.judgement")}
            </div>
          </div>
        </>
      )}
      {editing && <EstimateEditModal is={is} d={d} onClose={() => setEditing(false)} />}
    </section>
  );
}

const tokens = (n: number, lng: string) => (n >= 1_000_000 ? `${num(n / 1_000_000, lng)} M` : n >= 1000 ? `${num(n / 1000, lng)} K` : String(n));

function PeopleTable({ e, lng }: { e: Estimate; lng: string }) {
  const { t } = useTranslation();
  const hours = (stage: EstimatePeopleStage, x: Expertise) => e.people.find((p) => p.stage === stage && p.expertise === x)?.personHours ?? 0;
  const col = (x: Expertise) => PEOPLE_STAGES.reduce((s, st) => s + hours(st, x), 0);
  return (
    <table className="cov">
      <thead><tr><th />{EXPERTISES.map((x) => <th key={x} className="num">{t(`disc.est.expertise.${x}`)}</th>)}<th className="num">{t("disc.est.all")}</th></tr></thead>
      <tbody>
        {PEOPLE_STAGES.map((st) => (
          <tr key={st}>
            <td>{t(`disc.est.pstage.${st}`)}</td>
            {EXPERTISES.map((x) => <td key={x} className="num">{hours(st, x) ? num(hours(st, x), lng) : "—"}</td>)}
            <td className="num">{num(hours(st, "product") + hours(st, "tech"), lng)}</td>
          </tr>
        ))}
        <tr className="tot"><td>{t("disc.est.total")}</td>{EXPERTISES.map((x) => <td key={x} className="num">{num(col(x), lng)}</td>)}
          <td className="num">{num(col("product") + col("tech"), lng)}</td></tr>
      </tbody>
    </table>
  );
}

/** The manual edit of the estimate by an expert: a revision of a person (R18). */
function EstimateEditModal({ is, d, onClose }: { is: IssueCard; d: DiscoveryView; onClose: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const e0 = d.estimate;
  const [agent, setAgent] = useState<Record<string, number>>(Object.fromEntries(AGENT_STAGES.map((s) => [s, e0?.agent.find((a) => a.stage === s)?.usd ?? 0])));
  const [people, setPeople] = useState<Record<string, number>>(Object.fromEntries(
    PEOPLE_STAGES.flatMap((s) => EXPERTISES.map((x) => [`${s}/${x}`, e0?.people.find((p) => p.stage === s && p.expertise === x)?.personHours ?? 0]))));
  const [days, setDays] = useState(e0?.days ?? 1);
  const [waitDays, setWaitDays] = useState(e0?.waitDays ?? 0);
  const [confidence, setConfidence] = useState<EstimateConfidence>(e0?.confidence ?? "low");
  const [basis, setBasis] = useState((e0?.basis.features ?? []).join(", "));
  const save = useMutation({
    mutationFn: () => {
      const estimate: Estimate = {
        agent: AGENT_STAGES.map((s) => ({ stage: s, usd: agent[s] ?? 0, tokens: e0?.agent.find((a) => a.stage === s)?.tokens ?? 0 })),
        people: PEOPLE_STAGES.flatMap((s) => EXPERTISES.map((x) => ({ stage: s, expertise: x, personHours: people[`${s}/${x}`] ?? 0 })))
          .filter((p) => p.personHours > 0),
        days, waitDays, confidence,
        basis: { features: basis.split(/[\s,]+/).filter(Boolean), judgement: false },
      };
      return api.put(`/api/v1/issues/${is.key}/discovery`, discoveryBody(d, { estimate }));
    },
    onSuccess: () => {
      invalidateCycle(qc);
      qc.invalidateQueries({ queryKey: keys.discovery(is.key) });
      onClose();
    },
  });
  const n = (v: string) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  return (
    <Modal wide title={t("disc.est.editTitle")} onClose={onClose} footer={<>
      <button className="btn ghost" onClick={onClose}>{t("common.cancel")}</button>
      <button className="btn primary" disabled={save.isPending} onClick={() => save.mutate()}>{t("common.save")}</button>
    </>}>
      <div className="estgrid">
        <div>
          <h6>{t("disc.est.agentUsd")}</h6>
          <table className="cov"><tbody>
            {AGENT_STAGES.map((s) => (
              <tr key={s}><td><label htmlFor={`est-a-${s}`}>{t(`disc.est.stage.${s}`)}</label></td>
                <td><input id={`est-a-${s}`} className="inp estinp" type="number" min={0} value={agent[s]} onChange={(e) => setAgent({ ...agent, [s]: n(e.target.value) })} /></td></tr>
            ))}
          </tbody></table>
        </div>
        <div>
          <h6>{t("disc.est.people")}</h6>
          <table className="cov">
            <thead><tr><th />{EXPERTISES.map((x) => <th key={x}>{t(`disc.est.expertise.${x}`)}</th>)}</tr></thead>
            <tbody>
              {PEOPLE_STAGES.map((s) => (
                <tr key={s}><td>{t(`disc.est.pstage.${s}`)}</td>
                  {EXPERTISES.map((x) => (
                    <td key={x}><input className="inp estinp" type="number" min={0} step={0.5} aria-label={`${t(`disc.est.pstage.${s}`)} · ${t(`disc.est.expertise.${x}`)}`}
                      value={people[`${s}/${x}`]} onChange={(e) => setPeople({ ...people, [`${s}/${x}`]: n(e.target.value) })} /></td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="estfoot">
        <div className="field"><label htmlFor="est-days">{t("disc.est.daysLabel")}</label>
          <input id="est-days" className="inp" type="number" min={1} max={365} value={days} onChange={(e) => setDays(n(e.target.value))} /></div>
        <div className="field"><label htmlFor="est-wait">{t("disc.est.waitLabel")}</label>
          <input id="est-wait" className="inp" type="number" min={0} value={waitDays} onChange={(e) => setWaitDays(n(e.target.value))} /></div>
      </div>
      <div className="field">
        <span className="small" style={{ fontWeight: 500 }}>{t("disc.est.confidenceLabel")}</span>
        <div className="seg" role="group" style={{ marginTop: 5 }}>
          {CONFIDENCES.map((c) => <button key={c} aria-pressed={confidence === c} onClick={() => setConfidence(c)}>{t(`disc.est.confidence.${c}`)}</button>)}
        </div>
      </div>
      <div className="field"><label htmlFor="est-basis">{t("disc.est.basisLabel")}</label>
        <input id="est-basis" className="inp mono" placeholder="FTR.FMS.CAR-0003, FTR.FMS.CAR-0005" value={basis} onChange={(e) => setBasis(e.target.value)} /></div>
      {save.error && <div className="err-text">{errorText(t, save.error)}</div>}
    </Modal>
  );
}

/** The whole document for PUT …/discovery: the manual edit replaces it, so every part goes back. */
export function discoveryBody(d: DiscoveryView | undefined, patch: Partial<{ content: string; value: string; measure: unknown; estimate: Estimate | null }>) {
  return {
    content: d?.content ?? "",
    value: d?.value ?? "",
    measure: d?.measure ?? null,
    similar: d?.similar ?? [],
    systems: d?.systems ?? [],
    services: d?.services ?? [],
    problemFeature: d?.problemTarget ?? "",
    estimate: d?.estimate ?? null,
    ...patch,
  };
}
