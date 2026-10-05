import { apiUrl } from "../api/base";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { PublicConfig } from "../api/types";
import { GitHubIcon, GitLabIcon, Icon } from "../components/Icon";
import { LANGUAGES, LANGUAGE_NAMES, setDocumentLanguage } from "../lib/i18n";

/** Sign-in: only the provider configured for the instance is offered
 * (FTR.HMR.CMN-0006 R1: the git provider, GitHub with an organization, or OIDC). */
export function LoginPage({ config }: { config: PublicConfig }) {
  const { t, i18n } = useTranslation();
  const [params] = useSearchParams();
  const error = params.get("error");
  const login = config.login ?? { kind: "git", label: config.provider === "github" ? "GitHub" : "GitLab" };
  const provider = login.label;
  const icon = login.kind === "oidc" ? <Icon name="key" /> : config.provider === "gitlab" && login.kind === "git" ? <GitLabIcon /> : <GitHubIcon />;
  return (
    <div className="login">
      <div className="c">
        <img src="/logo.png" alt={t("login.logoAlt")} />
        <h1>Hammurapi</h1>
        <p>{t("login.slogan")}</p>
        <a className="btn" href={apiUrl("/api/v1/auth/login")}>
          {icon}
          {t("login.signIn", { provider })}
        </a>
        {login.kind === "oidc" && <div className="small muted">{t("login.corporate")}</div>}
        {login.kind === "github" && login.org && <div className="small muted">{t("login.orgOnly", { org: login.org })}</div>}
        {error && <div className="err-text" role="alert">{t(`login.errors.${error}`, { defaultValue: t("login.errors.failed") })}</div>}
        <div className="chips langs">
          {LANGUAGES.map((l) => (
            <button key={l} lang={l} className={`chip${i18n.language === l ? " on" : ""}`}
              onClick={() => { i18n.changeLanguage(l); setDocumentLanguage(l); }}>
              {LANGUAGE_NAMES[l]}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
