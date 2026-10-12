import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api } from "../../api/client";
import { invalidateCycle, keys } from "../../api/queries";
import type { Autonomy } from "../../api/types";
import { errorText } from "../../lib/errors";
import { Modal } from "@green-on-grey/ui-kit";

/** Autonomy of the agent in a service, set by its owners (R17, design spec §3.19). */
export function AutonomyModal({ service, onClose }: { service: { key: string; autonomy: Autonomy }; onClose: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [level, setLevel] = useState<Autonomy>(service.autonomy);
  const save = useMutation({
    mutationFn: () => api.put(`/api/v1/services/${service.key}/autonomy`, { level }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.services });
      invalidateCycle(qc);
      onClose();
    },
  });
  return (
    <Modal title={t("autonomy.title", { key: service.key })} onClose={onClose} footer={
      <>
        <button className="btn ghost" onClick={onClose}>{t("common.cancel")}</button>
        <button className="btn primary" disabled={save.isPending} onClick={() => save.mutate()}>{t("common.save")}</button>
      </>
    }>
      {(["plan", "pr", "autonomous"] as Autonomy[]).map((l) => (
        <div key={l} className={`level${level === l ? " on" : ""}`} role="radio" aria-checked={level === l} tabIndex={0}
          onClick={() => setLevel(l)} onKeyDown={(e) => e.key === "Enter" && setLevel(l)}>
          <span className="radio" />
          <div><b>{t(`autonomy.${l}.name`)}</b><div className="small t2">{t(`autonomy.${l}.text`)}</div></div>
        </div>
      ))}
      <p className="small muted">{t("autonomy.noMerge")}</p>
      {save.error && <div className="err-text">{errorText(t, save.error)}</div>}
    </Modal>
  );
}
