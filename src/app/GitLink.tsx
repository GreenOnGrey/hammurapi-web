import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { apiUrl } from "../api/base";
import { onGitAccountRequired, request, type DeferredChange } from "../api/client";
import { errorText } from "../lib/errors";
import { Icon } from "../components/Icon";
import { Modal, useToast } from "../components/ui";
import { useSession } from "./session";

// FTR.HMR.CMN-0006 R2, tech §1.1: a change that writes to git needs the git
// account of the user. The refused change is kept in this tab while the user
// links the account and is repeated after the return.
const DEFERRED_KEY = "hmr.deferredChange";

/** The URL that starts linking the git account and returns to returnTo. */
export function gitLinkURL(returnTo: string): string {
  return apiUrl(`/api/v1/auth/git/link?returnTo=${encodeURIComponent(returnTo)}`);
}

function saveDeferred(c: DeferredChange | null) {
  try {
    if (c && !(c.body instanceof FormData)) sessionStorage.setItem(DEFERRED_KEY, JSON.stringify(c));
    else sessionStorage.removeItem(DEFERRED_KEY);
  } catch {
    // Storage may be unavailable: the user repeats the change by hand.
  }
}

function takeDeferred(): DeferredChange | null {
  try {
    const raw = sessionStorage.getItem(DEFERRED_KEY);
    sessionStorage.removeItem(DEFERRED_KEY);
    return raw ? (JSON.parse(raw) as DeferredChange) : null;
  } catch {
    return null;
  }
}

/** Offers to link the git account when a change needs it and repeats the change afterwards. */
export function GitLinkDialog() {
  const { t } = useTranslation();
  const { config } = useSession();
  const location = useLocation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const [change, setChange] = useState<DeferredChange | null>(null);
  const provider = config.provider === "gitlab" ? "GitLab" : "GitHub";

  useEffect(() => onGitAccountRequired(setChange), []);

  // The return from the git provider: ?gitLink=ok|failed|taken.
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const result = params.get("gitLink");
    if (!result) return;
    params.delete("gitLink");
    navigate({ pathname: location.pathname, search: params.toString() ? `?${params}` : "" }, { replace: true });
    qc.invalidateQueries({ queryKey: ["me"] });
    if (result !== "ok") {
      saveDeferred(null);
      toast({ kind: "error", title: t(result === "git_account_taken" || result === "taken" ? "gitLink.taken" : "gitLink.failed") });
      return;
    }
    const deferred = takeDeferred();
    if (!deferred) {
      toast({ kind: "ok", title: t("gitLink.linked", { provider }) });
      return;
    }
    request(deferred.method, deferred.path, deferred.body)
      .then(() => {
        toast({ kind: "ok", title: t("gitLink.repeated") });
        qc.invalidateQueries();
      })
      .catch((e) => toast({ kind: "error", title: errorText(t, e) }));
  }, [location.search]); // eslint-disable-line react-hooks/exhaustive-deps, react/exhaustive-effect-dependencies -- runs once per return from the git provider

  if (!change) return null;
  const link = () => {
    saveDeferred(change);
    window.location.href = gitLinkURL(location.pathname + location.search);
  };
  return (
    <Modal title={t("gitLink.title", { provider })} onClose={() => setChange(null)} footer={<>
      <button className="btn ghost" onClick={() => setChange(null)}>{t("common.cancel")}</button>
      <button className="btn primary" onClick={link}><Icon name="link" />{t("gitLink.link", { provider })}</button>
    </>}>
      <p>{t("gitLink.why", { provider })}</p>
      <p className="small muted">{t("gitLink.kept")}</p>
    </Modal>
  );
}
