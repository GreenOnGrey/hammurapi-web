import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api } from "../../api/client";
import { invalidateCycle, keys } from "../../api/queries";
import type { Autonomy, ServiceCheck } from "../../api/types";
import { errorText } from "../../lib/errors";
import { Modal } from "@green-on-grey/ui-kit";

const DEFAULT_CHECK_MINUTES = 10;

type AgentService = { key: string; autonomy: Autonomy; check?: ServiceCheck | null };

/**
 * The agent in a service: its autonomy, set by the owners (R17, design spec §3.19),
 * and the readiness check, set by the owners and administrators (FTR.HMR.CMN-0008 R1, R2).
 * Shared by the settings of a service and the agent window of a feature.
 */
export function useAgentSettings(service: AgentService | null) {
  const [level, setLevel] = useState<Autonomy>(service?.autonomy ?? "pr");
  const [command, setCommand] = useState(service?.check?.command ?? "");
  const [minutes, setMinutes] = useState(service?.check ? service.check.timeoutSec / 60 : DEFAULT_CHECK_MINUTES);
  const persist = async () => {
    if (!service) return;
    if (level !== service.autonomy) await api.put(`/api/v1/services/${service.key}/autonomy`, { level });
    const timeoutSec = Math.round(minutes * 60);
    if (command.trim() !== (service.check?.command ?? "") || (service.check && timeoutSec !== service.check.timeoutSec)) {
      await api.put(`/api/v1/services/${service.key}/check`, { command, timeoutSec });
    }
  };
  return { level, setLevel, command, setCommand, minutes, setMinutes, persist };
}

export function AgentFields({ settings, canSetAutonomy = true }: {
  settings: ReturnType<typeof useAgentSettings>;
  canSetAutonomy?: boolean;
}) {
  const { t } = useTranslation();
  const { level, setLevel, command, setCommand, minutes, setMinutes } = settings;
  return (
    <>
      {(["plan", "pr", "autonomous"] as Autonomy[]).map((l) => (
        <div key={l} className={`level${level === l ? " on" : ""}`} role="radio" aria-checked={level === l} tabIndex={0}
          aria-disabled={!canSetAutonomy} onClick={() => canSetAutonomy && setLevel(l)} onKeyDown={(e) => canSetAutonomy && e.key === "Enter" && setLevel(l)}>
          <span className="radio" />
          <div><b>{t(`autonomy.${l}.name`)}</b><div className="small t2">{t(`autonomy.${l}.text`)}</div></div>
        </div>
      ))}
      <p className="small muted">{t("autonomy.noMerge")}</p>
      <div className="field"><label htmlFor="check-command">{t("autonomy.check")}</label>
        <input id="check-command" className="inp mono" maxLength={2000} value={command} onChange={(e) => setCommand(e.target.value)} />
        <div className="hint">{t("autonomy.checkHint")}</div></div>
      <div className="field"><label htmlFor="check-timeout">{t("autonomy.checkTimeout")}</label>
        <input id="check-timeout" className="inp" style={{ width: 120 }} type="number" min={1} max={30} value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} /></div>
    </>
  );
}

/** The agent window of a feature, for the owners of a service who have no access to the administration. */
export function AutonomyModal({ service, onClose }: { service: AgentService; onClose: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const settings = useAgentSettings(service);
  const save = useMutation({
    mutationFn: settings.persist,
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
      <AgentFields settings={settings} />
      {save.error && <div className="err-text">{errorText(t, save.error)}</div>}
    </Modal>
  );
}
