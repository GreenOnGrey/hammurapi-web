// FTR.HMR.DEV-0004 R18, R19, design §3.8: the regeneration of the code of a service after it is done —
// the agent gets the comments and the failed CI checks of the PR and an optional comment of the expert.
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api } from "../../api/client";
import { invalidateFeature } from "../../api/queries";
import type { PRDTO } from "../../api/types";
import { errorText } from "../../lib/errors";
import { Modal, useToast } from "@green-on-grey/ui-kit";

export const REGENERATE_COMMENT_MAX = 4000;

type Regenerated = { taskId: string; comments: number; failedChecks: number; feedbackError?: boolean };

export function RegenerateModal({ featureId, service, pr, onClose }: { featureId: string; service: string; pr: PRDTO | null; onClose: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const toast = useToast();
  const [comment, setComment] = useState("");
  const run = useMutation({
    mutationFn: () => api.post<Regenerated>(`/api/v1/features/${featureId}/codegen/services/${encodeURIComponent(service)}/regenerate`, { comment }),
    onSuccess: (r) => {
      invalidateFeature(qc, featureId);
      toast({ kind: r.feedbackError ? "info" : "ok",
        title: r.feedbackError ? t("regen.startedNoFeedback") : t("regen.started", { comments: r.comments, checks: r.failedChecks }) });
      onClose();
    },
  });
  return (
    <Modal title={t("regen.title", { service })} onClose={onClose} footer={
      <>
        <button className="btn ghost" onClick={onClose}>{t("common.cancel")}</button>
        <button className="btn primary" disabled={run.isPending} onClick={() => run.mutate()}>{t("regen.run")}</button>
      </>
    }>
      <p className="small t2">{pr ? t("regen.withPr", { number: pr.number, ci: pr.ciStatus === "failure" ? t("regen.ciFailed") : "" }) : t("regen.noPr")}</p>
      <div className="field">
        <label htmlFor="regen-comment">{t("regen.comment")}</label>
        <textarea id="regen-comment" className="inp" rows={5} maxLength={REGENERATE_COMMENT_MAX} value={comment}
          placeholder={t("regen.commentHint")} onChange={(e) => setComment(e.target.value)} />
      </div>
      {run.error && <div className="err-text">{errorText(t, run.error)}</div>}
    </Modal>
  );
}
