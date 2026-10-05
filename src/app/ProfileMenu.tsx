import { useCallback, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";
import { useDomains } from "../api/queries";
import { errorText } from "../lib/errors";
import { LANGUAGES, LANGUAGE_NAMES, LANGUAGE_SHORT, setDocumentLanguage } from "../lib/i18n";
import { Icon } from "../components/Icon";
import { Avatar, Modal, useOutside } from "../components/ui";
import { useSession } from "./session";
import { useProfilePatch } from "./useProfilePatch";
import { gitLinkURL } from "./GitLink";

export function ProfileMenu({ onClose }: { onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const { me, profile, isAnyAdmin } = useSession();
  const domains = useDomains();
  const qc = useQueryClient();
  const [feedback, setFeedback] = useState(false);
  const close = useCallback(() => !feedback && onClose(), [feedback, onClose]);
  const ref = useOutside<HTMLDivElement>(true, close);

  const patch = useProfilePatch();

  const setLanguage = (lng: string) => {
    i18n.changeLanguage(lng);
    setDocumentLanguage(lng);
    patch.mutate({ language: lng });
  };

  const toggleDomain = (key: string) => {
    const set = new Set(profile.domains);
    if (set.has(key)) set.delete(key);
    else set.add(key);
    patch.mutate({ domains: [...set] });
  };

  const logout = async () => {
    try {
      await api.post("/api/v1/auth/logout");
    } finally {
      qc.clear();
      window.location.href = "/login";
    }
  };

  const roleSummary = [
    ...me.experts.map((e) => `${e.domain}: ${e.kinds.map((k) => t(`expert.${k}`)).join(", ")}`),
    ...(me.areaAdmin.length ? [`${t("roles.admin")}: ${me.areaAdmin.map((a) => t(`areas.${a}`)).join(", ")}`] : []),
    ...(me.ownedServices.length ? [`${t("roles.owner")}: ${me.ownedServices.join(", ")}`] : []),
  ].join("; ");

  return (
    <div className="menu" ref={ref} role="dialog" aria-label={t("profile.title")}>
      <div className="sec">
        <div className="line" style={{ justifyContent: "flex-start", gap: 10 }}>
          <Avatar name={me.displayName} url={me.avatarUrl} />
          <div>
            <b>{me.displayName}</b>
            <div className="small muted">
              {me.globalAdmin && <>{t("roles.globalAdmin")}{roleSummary ? "; " : ""}</>}
              {roleSummary || (!me.globalAdmin && t("roles.readerOnly"))}
            </div>
          </div>
        </div>
      </div>
      <div className="sec">
        <div className="line">
          <span>{t("profile.language")}</span>
          <span className="mini-seg">
            {LANGUAGES.map((l) => (
              <button key={l} className={profile.language === l ? "on" : ""} lang={l} title={LANGUAGE_NAMES[l]} aria-label={LANGUAGE_NAMES[l]}
                aria-pressed={profile.language === l} onClick={() => setLanguage(l)}>
                {LANGUAGE_SHORT[l]}
              </button>
            ))}
          </span>
        </div>
        <div className="line" style={{ marginTop: 12 }}>
          <span>{t("profile.theme")}</span>
          <span className="mini-seg">
            {(["light", "dark"] as const).map((th) => (
              <button key={th} className={profile.theme === th ? "on" : ""} onClick={() => patch.mutate({ theme: th })}>
                {t(`profile.themes.${th}`)}
              </button>
            ))}
          </span>
        </div>
      </div>
      <div className="sec">
        <div className="lab">{t("profile.myDomains")}</div>
        <div className="chips">
          {domains.data?.map((d) => (
            <button key={d.key} className={`chip${profile.domains.includes(d.key) ? " on" : ""}`} onClick={() => toggleDomain(d.key)} title={d.name}>
              {d.key}
            </button>
          ))}
          {domains.data?.length === 0 && <span className="small muted">{t("profile.noDomains")}</span>}
        </div>
      </div>
      <Accounts />
      {isAnyAdmin && (
        <div className="sec">
          <Link className="action" to="/admin" onClick={onClose}><Icon name="wrench" />{t("profile.admin")}</Link>
        </div>
      )}
      <div className="sec">
        <button className="action" onClick={() => setFeedback(true)}><Icon name="msg" />{t("profile.feedback")}</button>
      </div>
      <div className="sec">
        <button className="action danger" onClick={logout}><Icon name="out" />{t("profile.logout")}</button>
      </div>
      {feedback && <FeedbackModal onClose={() => setFeedback(false)} />}
    </div>
  );
}

/** Sign-in and the git account (FTR.HMR.CMN-0006 design: «Учётные записи»). */
function Accounts() {
  const { t } = useTranslation();
  const { me, config } = useSession();
  const qc = useQueryClient();
  const provider = config.provider === "gitlab" ? "GitLab" : "GitHub";
  const login = config.login ?? { kind: "git", label: provider, linksGit: true };
  const unlink = useMutation({
    mutationFn: () => api.del("/api/v1/me/git-account"),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["me"] }),
  });
  return (
    <div className="sec">
      <div className="lab">{t("accounts.title")}</div>
      <div className="line">
        <span>{t("accounts.signIn", { provider: login.label })}</span>
        <span className="small muted">{me.email ?? me.username}</span>
      </div>
      <div className="line" style={{ marginTop: 8 }}>
        <span>{t("accounts.git", { provider })}</span>
        {me.gitAccount ? (
          <span className="small" style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <span className="mono">{me.gitAccount.login}</span>
            {/* The sign-in account itself cannot be unlinked. */}
            {!login.linksGit && (
              <button className="btn ghost sm" disabled={unlink.isPending} onClick={() => unlink.mutate()}>{t("accounts.unlink")}</button>
            )}
          </span>
        ) : (
          <a className="btn sm" href={gitLinkURL(window.location.pathname)}><Icon name="link" size={14} />{t("accounts.link")}</a>
        )}
      </div>
      {!me.gitAccount && <div className="hint">{t("accounts.gitHint")}</div>}
      {unlink.error && <div className="err-text">{errorText(t, unlink.error)}</div>}
    </div>
  );
}

function FeedbackModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const [text, setText] = useState("");
  const send = useMutation({ mutationFn: () => api.post<{ url: string }>("/api/v1/feedback", { text }) });
  return (
    <Modal title={t("feedback.title")} onClose={onClose} footer={send.data ? (
      <button className="btn primary" onClick={onClose}>{t("common.close")}</button>
    ) : (
      <>
        <button className="btn ghost" onClick={onClose}>{t("common.cancel")}</button>
        <button className="btn primary" disabled={!text.trim() || send.isPending} onClick={() => send.mutate()}>{t("feedback.send")}</button>
      </>
    )}>
      {send.data ? (
        <p>{t("feedback.sent")} <a href={send.data.url} target="_blank" rel="noreferrer">{send.data.url}</a></p>
      ) : (
        <>
          <p className="t2" style={{ marginTop: 0 }}>{t("feedback.hint")}</p>
          <textarea className="inp" rows={6} value={text} onChange={(e) => setText(e.target.value)} aria-label={t("feedback.title")} />
          {send.error && <div className="err-text">{errorText(t, send.error)}</div>}
        </>
      )}
    </Modal>
  );
}
