import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { Icon, Modal, useToast } from "@green-on-grey/ui-kit";
import { ApiError, api } from "../../api/client";
import { keys } from "../../api/queries";
import type { CiCheck, CiToken } from "../../api/types";
import { useSession } from "../../app/session";
import { errorText } from "../../lib/errors";
import { dateTime } from "../../lib/format";

/** A check in CI: the repository of specifications, or a service (FTR.HMR.SPEC-0002 tech §3.3). */
export type CiTarget = { kind: "spec" } | { kind: "service"; key: string; repo: string };

/** A modal over the card of a service, itself a modal: the kit closes every open modal on Escape, so this one
 * takes Escape first and closes only itself — the token shown once is not lost with the card. */
function NestedModal({ title, onClose, footer, children }: { title: string; onClose: () => void; footer: ReactNode; children: ReactNode }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      onClose();
    };
    window.addEventListener("keydown", k, true);
    return () => window.removeEventListener("keydown", k, true);
  }, [onClose]);
  return <Modal title={title} onClose={onClose} footer={footer}>{children}</Modal>;
}

const base = (t: CiTarget) => (t.kind === "spec" ? "/api/v1/ci-checks/spec" : `/api/v1/ci-checks/services/${encodeURIComponent(t.key)}`);
// FTR.HMR.SPEC-0003: one installation token for CI without OIDC; the OIDC token of a CI job needs none
const tokenPath = "/api/v1/ci-token";

// design §1: the status is told by the text of the chip as well as by its colour
const CHIP: Record<CiCheck["status"], string> = { none: "none", proposed: "handed_off", on: "draft", outdated: "in_review", manual: "in_review" };

const ciKey = (t: CiTarget) => (t.kind === "spec" ? keys.ciCheckSpec : keys.ciCheckService(t.key));

export const useCiCheck = (target: CiTarget) => useQuery({ queryKey: ciKey(target), queryFn: () => api.get<CiCheck>(base(target)) });

export const useCiToken = () => useQuery({ queryKey: keys.ciToken, queryFn: () => api.get<CiToken>(tokenPath) });

/** The text of an error of the proposal: the permission of the GitHub App, the rights of the user in git. */
function proposeError(t: TFunction, e: unknown, repo: string) {
  if (e instanceof ApiError && e.code === "provider_forbidden") {
    return e.details?.missing === "workflows" ? t("ciCheck.noWorkflows") : t("ciCheck.noRights", { repo });
  }
  return errorText(t, e);
}

/** The row «CI check» (design §3.1, §3.2): the chip of the status, the PR, «Propose PR» and «Check now». */
export function CiCheckRow({ target, canPropose }: { target: CiTarget; canPropose: boolean }) {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const toast = useToast();
  const q = useCiCheck(target);
  const [confirm, setConfirm] = useState(false);
  const qk = ciKey(target);
  const scan = useMutation({
    mutationFn: () => api.post<CiCheck>(`${base(target)}/scan`),
    onSuccess: (st) => qc.setQueryData(qk, st),
    onError: (e) => toast({ kind: "error", title: errorText(t, e) }),
  });
  const repo = target.kind === "service" ? target.repo : q.data?.repo ?? "";
  const propose = useMutation({
    mutationFn: () => api.post<CiCheck>(`${base(target)}/propose`),
    onSuccess: (st) => {
      qc.setQueryData(qk, st);
      setConfirm(false);
      toast({ kind: "ok", title: t("ciCheck.opened") });
    },
    onError: (e) => {
      toast({ kind: "error", title: proposeError(t, e, repo) });
      setConfirm(false);
      void qc.invalidateQueries({ queryKey: qk }); // another proposal may have won: show it
    },
  });
  const closeConfirm = useCallback(() => setConfirm(false), []);
  const st = q.data;
  const label = !st ? "" : st.status === "on" ? t("ciCheck.status.on", { version: st.version ?? "" })
    : st.status === "outdated" ? t("ciCheck.status.outdated", { version: st.version ?? "", contract: st.contractVersion })
      : t(`ciCheck.status.${st.status}`);
  return (
    <div className="cirow">
      <span className="cirow-l">{t("ciCheck.title")}</span>
      {q.isLoading && <span className="small muted">…</span>}
      {q.error && <span className="small err-text">{errorText(t, q.error)}</span>}
      {st && <span className={`st ${CHIP[st.status]}${st.status === "on" ? " cion" : ""}`}>{label}</span>}
      {st?.pr && <a className="small" href={st.pr.url} target="_blank" rel="noreferrer">{t("ciCheck.pr", { number: st.pr.number })}</a>}
      {st?.status === "none" && canPropose && (
        <button type="button" className="btn sm" onClick={() => setConfirm(true)}>{t("ciCheck.propose")}</button>
      )}
      {st && canPropose && (
        <button type="button" className="btn ghost sm" disabled={scan.isPending} onClick={() => scan.mutate()} title={st.checkedAt ? t("ciCheck.checkedAt", { at: dateTime(st.checkedAt, i18n.language) }) : undefined}>
          <Icon name="refresh" size={14} />{t("specScan.checkNow")}
        </button>
      )}
      {st?.status === "manual" && <div className="cirow-hint small muted">{t("ciCheck.manualHint")}</div>}
      {st?.error && <div className="cirow-hint small err-text">{t("ciCheck.providerError", { error: st.error })}</div>}
      {confirm && st && (
        <NestedModal title={t("ciCheck.proposeTitle")} onClose={closeConfirm} footer={
          <>
            <button className="btn ghost" onClick={closeConfirm}>{t("common.cancel")}</button>
            <button className="btn primary" disabled={propose.isPending} onClick={() => propose.mutate()}>{t("ciCheck.open")}</button>
          </>
        }>
          <p>{t("ciCheck.proposeText", { repo, path: st.path ?? "", version: st.contractVersion })}</p>
          {st.path?.startsWith(".gitlab/") && <p className="small">{t("ciCheck.proposeGitLab")}</p>}
          {target.kind === "service" && <p className="small">{t("ciCheck.proposeService", { key: target.key })}</p>}
        </NestedModal>
      )}
    </div>
  );
}

/** The row «CI token» in Settings (FTR.HMR.SPEC-0003 design §3.1): issued or not, its use, issue, reissue and
 * revoke; only CI without OIDC needs it. */
export function CiTokenRow({ provider }: { provider: string }) {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const toast = useToast();
  const q = useCiToken();
  const [ask, setAsk] = useState<"reissue" | "revoke" | null>(null);
  const [shown, setShown] = useState<string | null>(null);
  const issue = useMutation({
    mutationFn: async (reissue: boolean) => {
      if (!reissue) { // the row may be stale: issuing revokes a token another administrator has just issued
        const cur = await api.get<CiToken>(tokenPath);
        if (cur.issued) {
          qc.setQueryData(keys.ciToken, cur);
          return null;
        }
      }
      return api.post<{ token: string; prefix: string }>(tokenPath);
    },
    onSuccess: (r) => {
      if (!r) {
        setAsk("reissue");
        return;
      }
      setAsk(null);
      setShown(r.token);
      void qc.invalidateQueries({ queryKey: keys.ciToken });
    },
    onError: (e) => toast({ kind: "error", title: errorText(t, e) }),
  });
  const revoke = useMutation({
    mutationFn: () => api.del(tokenPath),
    onSuccess: () => {
      setAsk(null);
      void qc.invalidateQueries({ queryKey: keys.ciToken });
    },
    onError: (e) => toast({ kind: "error", title: errorText(t, e) }),
  });
  const tok = q.data;
  const closeAsk = useCallback(() => setAsk(null), []);
  const closeShown = useCallback(() => setShown(null), []);
  return (
    <div className="cirow">
      <span className="cirow-l">{t("ciToken.title")}</span>
      {q.error && <span className="small err-text">{errorText(t, q.error)}</span>}
      {tok && !tok.issued && <span className="st none">{t("ciToken.none")}</span>}
      {tok?.issued && (
        <span className="small">
          <span className="mono">{tok.prefix}…</span>{" "}
          {t("ciToken.issued", {
            at: tok.createdAt ? dateTime(tok.createdAt, i18n.language) : "",
            used: tok.lastUsedAt ? dateTime(tok.lastUsedAt, i18n.language) : t("ciToken.never"),
          })}
        </span>
      )}
      {tok && !tok.issued && <button type="button" className="btn sm" disabled={issue.isPending} onClick={() => issue.mutate(false)}>{t("ciToken.issue")}</button>}
      {tok?.issued && <>
        <button type="button" className="btn ghost sm" onClick={() => setAsk("reissue")}>{t("ciToken.reissue")}</button>
        <button type="button" className="btn ghost sm danger" onClick={() => setAsk("revoke")}>{t("ciToken.revoke")}</button>
      </>}
      {tok && !tok.issued && <div className="cirow-hint small muted">{t("ciToken.hint")}</div>}
      {ask && (
        <NestedModal title={t(`ciToken.${ask}Title`)} onClose={closeAsk} footer={
          <>
            <button className="btn ghost" onClick={closeAsk}>{t("common.cancel")}</button>
            <button className="btn primary danger" disabled={issue.isPending || revoke.isPending}
              onClick={() => (ask === "reissue" ? issue.mutate(true) : revoke.mutate())}>{t(`ciToken.${ask}`)}</button>
          </>
        }>
          <p>{t("ciToken.breaks")}</p>
        </NestedModal>
      )}
      {shown && <TokenModal provider={provider} token={shown} onClose={closeShown} />}
    </div>
  );
}

/** The token, once (design §3.3): copy, where to put it, «Done» only after «I saved the token». */
export function TokenModal({ provider, token, onClose }: { provider: string; token: string; onClose: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const [saved, setSaved] = useState(false);
  const secrets = provider === "gitlab" ? t("ciToken.whereGitLab") : t("ciToken.whereGitHub");
  // closed only after «I saved the token»: Escape and the cross do nothing before
  const close = useCallback(() => { if (saved) onClose(); }, [saved, onClose]);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(token);
      toast({ kind: "ok", title: t("ciToken.copied") });
    } catch {
      (document.getElementById("ci-token") as HTMLInputElement | null)?.select(); // no clipboard (plain http): select it
      toast({ kind: "error", title: t("ciToken.copyFailed") });
    }
  };
  return (
    <NestedModal title={t("ciToken.modalTitle")} onClose={close} footer={
      <button className="btn primary" disabled={!saved} onClick={onClose}>{t("ciToken.done")}</button>
    }>
      <div className="row tokrow">
        <input id="ci-token" className="inp mono tok-inp" readOnly value={token} aria-label={t("ciToken.title")} onFocus={(e) => e.currentTarget.select()} />
        <button type="button" className="btn sm" onClick={() => void copy()}><Icon name="copy" size={14} />{t("ciToken.copy")}</button>
      </div>
      <p className="small">{t("ciToken.once")}</p>
      <p className="small muted">{secrets}</p>
      <label className="row small"><input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} />{t("ciToken.saved")}</label>
    </NestedModal>
  );
}

/** The section «CI check of tests» of the card of a service (design §2, FTR.HMR.SPEC-0003 design §3.2): only the
 * status of the check — the job presents the OIDC token of its CI, there is no token of the service. */
export function ServiceCiSection({ service, repo }: { service: string; repo: string }) {
  const { t } = useTranslation();
  const { owns, isAnyAdmin } = useSession();
  return (
    <>
      <h3 className="group-h">{t("ciCheck.section")}</h3>
      <CiCheckRow target={{ kind: "service", key: service, repo }} canPropose={owns(service) || isAnyAdmin} />
    </>
  );
}
