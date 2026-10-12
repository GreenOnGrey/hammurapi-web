import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api } from "../../api/client";
import { invalidateFeature, useValidation } from "../../api/queries";
import type { ExpertKind, FeatureCard, ValidationSummary } from "../../api/types";
import { errorText } from "../../lib/errors";
import { dateTime } from "../../lib/format";
import { Empty, Icon, Loading, Modal, useToast } from "@green-on-grey/ui-kit";
import { Dot, Kpi, KeyList } from "../../components/cycle";
import { Matrix } from "./Implementation";
import { BlockedBanner } from "../../components/BlockedBanner";

/** Validation tab (R22–R25): summary, discrepancies, stage, two signatures, return. */
export function ValidationTab({ f }: { f: FeatureCard }) {
  const { t, i18n } = useTranslation();
  const v = useValidation(f.uniqueId);
  const [dialog, setDialog] = useState<"return" | null>(null);
  if (v.isLoading) return <Loading />;
  const d = v.data;
  if (!d) return null;
  if (!d.state && f.phase !== "validation") {
    return <Empty icon="flask" title={t("val.notYet")}>{t("val.notYetHint")}</Empty>;
  }
  const failed = d.tests.filter((x) => x.status === "failed").length;
  const passed = d.tests.filter((x) => x.status === "passed").length;
  const reviewsOk = d.reviews.filter((r) => r.passed).length;
  return (
    <>
      {d.state === "waiting_ci" && <div className="banner info"><span className="ring" /><span className="grow">{t("val.waitingCi")}</span></div>}
      {d.state === "waiting_stage_deploy" && <div className="banner info"><span className="ring" /><span className="grow">{t("val.waitingStage")}</span></div>}
      {d.state === "blocked" && <BlockedBanner title="" reason={d.lastError} />}
      {f.release && <div className="banner ok"><Icon name="rocket" /><span className="grow">{t("val.released")} <KeyList keys={[f.release]} /></span></div>}
      <Kpi items={[
        { value: `${passed}/${d.tests.length}`, label: failed ? t("val.kpi.testsFailed", { n: failed }) : t("val.kpi.tests") },
        { value: `${d.coverage.passed}/${d.coverage.requirements}`, label: t("val.kpi.coverage") },
        { value: d.discrepancies.length, label: t("val.kpi.discrepancies") },
        { value: `${reviewsOk}/${d.reviews.length}`, label: t("val.kpi.reviews") },
      ]} />
      {d.discrepancies.map((x) => (
        <div key={x.id} className="banner warn"><Icon name="alert" />
          <span className="grow"><b>{x.requirement}</b>{x.service ? ` · ${x.service}` : ""}: {x.description}</span>
          {x.prUrl && <a className="btn sm" href={x.prUrl} target="_blank" rel="noreferrer">PR</a>}
        </div>
      ))}

      <h3 className="group-h">{t("val.tests")}</h3>
      {d.tests.length === 0 ? <p className="small muted">{t("val.noTests")}</p> : (
        <table className="cov">
          <thead><tr><th>{t("impl.testCases")}</th><th>{t("val.level")}</th><th>{t("impl.requirement")}</th><th>{t("val.result")}</th></tr></thead>
          <tbody>
            {d.tests.map((x) => (
              <tr key={x.id} className={x.status === "failed" || x.status === "missing" ? "gap" : undefined}>
                <td className="mono">{x.id} <span className="t2" style={{ fontFamily: "var(--font)" }}>{x.title}</span></td>
                <td>{x.level}</td>
                <td className="small">{x.requirements.join(", ")}</td>
                <td><Dot tone={x.status === "passed" ? "g" : x.status === "failed" ? "r" : "n"} />{t(`val.status.${x.status}`)}{x.environment === "stage" ? " · e2e" : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h3 className="group-h">{t("val.reviews")}</h3>
      <table className="cov">
        <tbody>
          {d.reviews.map((r) => (
            <tr key={r.url}>
              <td><b>{r.service}</b> <a href={r.url} target="_blank" rel="noreferrer">#{r.pr}</a></td>
              <td><Dot tone={r.ci === "success" ? "g" : r.ci === "failure" ? "r" : "a"} />CI: {t(`ci.${r.ci}`, { defaultValue: r.ci })}</td>
              <td><Dot tone={r.passed ? "g" : "a"} />{t(`review.${r.review}`)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {d.stage.enabled && <StageBlock f={f} d={d} />}

      <h3 className="group-h">{t("impl.matrix")}</h3>
      <Matrix rows={d.matrix} />

      <h3 className="group-h">{t("val.signatures")}</h3>
      <div className="sign">
        {(["product", "technical"] as ExpertKind[]).map((side) => {
          const sig = d.signatures.find((s) => s.side === side);
          const can = side === "product" ? d.permissions.signProduct : d.permissions.signTechnical;
          return (
            <div key={side}>
              <b>{t(`val.side.${side}`)}</b>
              {sig ? (
                <p className="small" style={{ margin: "6px 0 0" }}><Icon name="check" size={14} /> {sig.user} · {dateTime(sig.signedAt, i18n.language)}{sig.comment ? ` — ${sig.comment}` : ""}</p>
              ) : can ? <SignButton f={f} side={side} /> : <p className="small muted" style={{ margin: "6px 0 0" }}>{t("val.waitingSignature")}</p>}
            </div>
          );
        })}
      </div>
      <p className="small muted">{t("val.releaseHint")}</p>
      {d.permissions.return && (
        <div className="actionbar"><span className="grow ab-grow" /><button className="btn sm" onClick={() => setDialog("return")}><Icon name="undo" size={14} />{t("val.return")}</button></div>
      )}
      {dialog === "return" && <ReturnModal f={f} onClose={() => setDialog(null)} />}
    </>
  );
}

function SignButton({ f, side }: { f: FeatureCard; side: ExpertKind }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();
  const sign = useMutation({
    mutationFn: () => api.post<{ releaseKey: string | null }>(`/api/v1/features/${f.uniqueId}/validation/sign`, { side }),
    onSuccess: (r) => {
      invalidateFeature(qc, f.uniqueId);
      if (r.releaseKey) {
        toast({ kind: "ok", title: t("val.releaseCreated", { key: r.releaseKey }) });
        navigate(`/releases/${r.releaseKey}`);
      } else toast({ kind: "ok", title: t("val.signed") });
    },
    onError: (e) => toast({ kind: "error", title: errorText(t, e) }),
  });
  return <button className="btn primary sm" style={{ marginTop: 8 }} disabled={sign.isPending} onClick={() => sign.mutate()}><Icon name="check" size={14} />{t("val.sign")}</button>;
}

function StageBlock({ f, d }: { f: FeatureCard; d: ValidationSummary }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const toast = useToast();
  const mark = useMutation({
    mutationFn: (service: string) => api.post(`/api/v1/features/${f.uniqueId}/stage/deploys/${service}/mark`),
    onSuccess: () => invalidateFeature(qc, f.uniqueId),
    onError: (e) => toast({ kind: "error", title: errorText(t, e) }),
  });
  return (
    <>
      <h3 className="group-h">{t("val.stage")}</h3>
      {!d.stage.configured && <p className="small muted">{t("val.stageManual")}</p>}
      <table className="cov">
        <tbody>
          {d.stage.deploys.map((x) => (
            <tr key={x.id}>
              <td><b>{x.service}</b> <span className="mono small">{x.ref}</span></td>
              <td><Dot tone={x.status === "success" ? "g" : x.status === "failure" || x.status === "timeout" ? "r" : "a"} />{t(`deploy.status.${x.status}`)}</td>
              <td>{x.runUrl && <a href={x.runUrl} target="_blank" rel="noreferrer">{t("deploy.run")}</a>}</td>
              <td>{d.permissions.markStage && x.status !== "success" && <button className="btn sm" onClick={() => mark.mutate(x.service)}>{t("val.markStage")}</button>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

function ReturnModal({ f, onClose }: { f: FeatureCard; onClose: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [target, setTarget] = useState<"code" | "spec">("code");
  const [comment, setComment] = useState("");
  const go = useMutation({
    mutationFn: () => api.post(`/api/v1/features/${f.uniqueId}/validation/return`, { target, comment }),
    onSuccess: () => { invalidateFeature(qc, f.uniqueId); onClose(); },
  });
  return (
    <Modal title={t("val.returnTitle")} onClose={onClose} footer={
      <>
        <button className="btn ghost" onClick={onClose}>{t("common.cancel")}</button>
        <button className="btn primary" disabled={!comment.trim() || go.isPending} onClick={() => go.mutate()}>{t("val.return")}</button>
      </>
    }>
      <div className="seg" style={{ marginBottom: 12 }}>
        <button aria-pressed={target === "code"} onClick={() => setTarget("code")}>{t("val.toCode")}</button>
        <button aria-pressed={target === "spec"} onClick={() => setTarget("spec")}>{t("val.toSpec")}</button>
      </div>
      <p className="small t2">{t(`val.returnHint.${target}`)}</p>
      <div className="field">
        <label htmlFor="ret-comment">{t("val.comment")}</label>
        <textarea id="ret-comment" className="inp" rows={4} value={comment} onChange={(e) => setComment(e.target.value)} />
      </div>
      {go.error && <div className="err-text">{errorText(t, go.error)}</div>}
    </Modal>
  );
}
