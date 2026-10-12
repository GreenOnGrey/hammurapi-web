import { apiUrl } from "../api/base";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { PublicConfig } from "../api/types";
import { GitHubIcon, Icon } from "@green-on-grey/ui-kit";
import { LoginScreen } from "@green-on-grey/ui-kit/login";
import { GitLabIcon } from "../components/GitLabIcon";
import { LANGUAGES, LANGUAGE_NAMES, setDocumentLanguage } from "../lib/i18n";

/** Sign-in: only the provider configured for the instance is offered
 * (FTR.HMR.CMN-0006 R1: the git provider, GitHub with an organization, or OIDC).
 * The screen is the one of the kit, in the look of Nabu (FTR.NAB.CMN-0005 R6, design §5). */
export function LoginPage({ config }: { config: PublicConfig }) {
  const { t, i18n } = useTranslation();
  const [params] = useSearchParams();
  const error = params.get("error");
  const login = config.login ?? { kind: "git", label: config.provider === "github" ? "GitHub" : "GitLab" };
  const provider = login.label;
  const icon = login.kind === "oidc" ? <Icon name="key" /> : config.provider === "gitlab" && login.kind === "git" ? <GitLabIcon /> : <GitHubIcon />;
  const note = login.kind === "oidc" ? t("login.corporate") : login.kind === "github" && login.org ? t("login.orgOnly", { org: login.org }) : undefined;
  return (
    <LoginScreen logo="/logo.png" logoAlt={t("login.logoAlt")} name="HAMMURAPI" tagline={t("login.slogan")}
      signIn={{ href: apiUrl("/api/v1/auth/login"), icon, label: t("login.signIn", { provider }) }} note={note}
      error={error ? t(`login.errors.${error}`, { defaultValue: t("login.errors.failed") }) : undefined}
      languages={LANGUAGES.map((l) => ({ code: l, label: LANGUAGE_NAMES[l], active: i18n.language === l }))}
      onLanguage={(l) => { i18n.changeLanguage(l); setDocumentLanguage(l); }} />
  );
}
