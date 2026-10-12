import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";
import { invalidateCycle, useDomains } from "../api/queries";
import type { IssueType } from "../api/types";
import { useSession } from "../app/session";
import { errorText } from "../lib/errors";
import { Icon, Modal } from "@green-on-grey/ui-kit";

/** New issue: any user creates one; Discovery starts right away (R1, R4). */
export function NewIssueModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { profile } = useSession();
  const domains = useDomains();
  const [type, setType] = useState<IssueType>("idea");
  const [domain, setDomain] = useState(profile.domains[0] ?? "");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const d = domains.data?.find((x) => x.key === domain) ?? domains.data?.[0];

  const create = useMutation({
    mutationFn: () => api.post<{ key: string }>("/api/v1/issues", { type, domain: d?.key, title, description }),
    onSuccess: (r) => {
      invalidateCycle(qc);
      onClose();
      navigate(`/issues/${r.key}`);
    },
  });
  const preview = useMemo(() => (d ? `ISS.${d.key}-NNNN` : null), [d]);
  const valid = !!d && title.trim().length > 0;
  return (
    <Modal title={t("newIssue.title")} onClose={onClose} footer={
      <>
        <button className="btn ghost" onClick={onClose}>{t("common.cancel")}</button>
        <button className="btn primary" disabled={!valid || create.isPending} onClick={() => create.mutate()}>
          {create.isPending ? t("newIssue.creating") : t("newIssue.create")}
        </button>
      </>
    }>
      <form onSubmit={(e) => { e.preventDefault(); if (valid) create.mutate(); }}>
        <div className="seg" role="radiogroup" aria-label={t("newIssue.type")} style={{ marginBottom: 12 }}>
          {(["idea", "problem"] as const).map((x) => (
            <button type="button" key={x} aria-pressed={type === x} onClick={() => setType(x)}>
              <Icon name={x === "idea" ? "bulb" : "bug"} size={14} /> {t(`issueType.${x}`)}
            </button>
          ))}
        </div>
        <div className="hint" style={{ marginTop: -6, marginBottom: 12 }}>{t(`newIssue.typeHint.${type}`)}</div>
        <div className="field">
          <label htmlFor="ni-domain">{t("newIssue.domain")}</label>
          <select id="ni-domain" className="inp" value={d?.key ?? ""} onChange={(e) => setDomain(e.target.value)}>
            {domains.data?.map((x) => <option key={x.key} value={x.key}>{x.key} — {x.name}</option>)}
          </select>
        </div>
        {domains.data?.length === 0 && <div className="banner warn">{t("newFeature.noDictionary")}</div>}
        <div className="field">
          <label htmlFor="ni-title">{t("newIssue.name")}</label>
          <input id="ni-title" className="inp" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="ni-desc">{t("newIssue.description")}</label>
          <textarea id="ni-desc" className="inp" rows={5} value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        {preview && <div className="preview-id">{t("newIssue.preview", { key: preview })}</div>}
        {create.error && <div className="err-text">{errorText(t, create.error)}</div>}
      </form>
    </Modal>
  );
}
