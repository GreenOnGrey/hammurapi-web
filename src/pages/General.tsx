import { useEffect } from "react";
import { Link, NavLink, useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useDomains, useFocus, useOverview } from "../api/queries";
import type { FocusItem, OverviewCard } from "../api/types";
import { useChatContext } from "../app/session";
import { duration } from "../lib/format";
import { Icon } from "../components/Icon";
import { Loading } from "../components/ui";
import { adminPath } from "./admin/paths";
import {
  IssueStatusBadge,
  IssueTypeBadge,
  KeyLink,
  KeyList,
  keyHref,
  PhaseBadge,
  Progress,
  ReleaseStatusBadge,
} from "../components/cycle";

function GeneralTabs() {
  const { t } = useTranslation();
  return (
    <div className="tabs" role="tablist">
      <NavLink to="/" end className={({ isActive }) => (isActive ? "on" : "")}>
        {t("general.focus")}
      </NavLink>
      <NavLink
        to="/overview"
        className={({ isActive }) => (isActive ? "on" : "")}
      >
        {t("general.overview")}
      </NavLink>
    </div>
  );
}

function useGeneralChat() {
  const chat = useChatContext();
  const { setSubject } = chat;
  useEffect(() => setSubject(null), [setSubject]);
}

/** "In focus": what waits for my decision now, by stage, longest waiting first (R37). */
export function FocusPage() {
  const { t } = useTranslation();
  const focus = useFocus();
  useGeneralChat();
  const groups: {
    key: "research" | "development" | "release";
    icon: "bulb" | "code" | "rocket";
  }[] = [
    { key: "research", icon: "bulb" },
    { key: "development", icon: "code" },
    { key: "release", icon: "rocket" },
  ];
  return (
    <main className="main">
      <GeneralTabs />
      {focus.isLoading && <Loading />}
      {focus.data?.agent && focus.data.agent.length > 0 && (
        <section className="focusgroup" aria-label={t("focus.agent")}>
          <div className="gh">
            <Icon name="cpu" size={16} />
            {t("focus.agent")}
            <span className="count">{focus.data.agent.length}</span>
          </div>
          {focus.data.agent.map((it) => (
            <AgentFocusRow key={`${it.kind}-${it.key}-${it.action}`} it={it} />
          ))}
        </section>
      )}
      {focus.data?.spec && focus.data.spec.length > 0 && (
        <section className="focusgroup" aria-label={t("focus.spec")}>
          <div className="gh">
            <Icon name="book" size={16} />
            {t("focus.spec")}
            <span className="count">{focus.data.spec.length}</span>
          </div>
          {focus.data.spec.map((it) => (
            <SpecFocusRow key={`${it.key}-${it.action}`} it={it} />
          ))}
        </section>
      )}
      {focus.data &&
        groups.map((g) => {
          const items = focus.data[g.key];
          return (
            <section
              key={g.key}
              className="focusgroup"
              aria-label={t(`focus.${g.key}`)}
            >
              <div className="gh">
                <Icon name={g.icon} size={16} />
                {t(`focus.${g.key}`)}
                {items.length > 0 && (
                  <span className="count">{items.length}</span>
                )}
                {items.length === 0 && (
                  <span className="small muted" style={{ fontWeight: 400 }}>
                    {t("focus.nothing")}
                  </span>
                )}
              </div>
              {items.map((it) => (
                <FocusRow
                  key={`${it.key}-${it.action}-${it.hint ?? ""}`}
                  it={it}
                />
              ))}
            </section>
          );
        })}
    </main>
  );
}

function FocusRow({ it }: { it: FocusItem }) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  let href = keyHref(it.key);
  if (it.action === "approve_gate" && it.hint)
    href = `/features/${it.key}/spec/${it.hint}`;
  if (it.action === "sign_validation") href = `/features/${it.key}/validation`;
  const hint =
    it.action === "approve_gate" && it.hint
      ? t(`areas.${it.hint}`)
      : it.action === "sign_validation" && it.hint
        ? t(`expert.${it.hint}`)
        : (it.hint ?? "");
  return (
    <div
      className="irow"
      role="link"
      tabIndex={0}
      onClick={() => navigate(href)}
      onKeyDown={(e) => e.key === "Enter" && navigate(href)}
    >
      <span>
        <KeyLink k={it.key} />
      </span>
      <span
        className={`st ${it.action === "retry_or_rollback" || it.action === "resolve_blocked" ? "blocked" : "in_review"}`}
      >
        {t(`focus.action.${it.action}`)}
      </span>
      <span className="ellipsis">{it.title}</span>
      <span className="small t2 ellipsis" title={hint}>
        {hint}
      </span>
      <span className="small muted">
        <Icon name="clock" size={14} />{" "}
        {duration(it.waitingSince, i18n.language)}
      </span>
    </div>
  );
}

/** A problem of the agent: a connection, an MCP server or no model (FTR.HMR.CMN-0004 R21). */
/** A problem of indexing the specification repository (FTR.HMR.CMN-0005 R10):
 * missing domains lead to the domains page, the rest to the check in Settings. */
function SpecFocusRow({ it }: { it: FocusItem }) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const href =
    it.action === "missing_catalog"
      ? adminPath("domains")
      : adminPath("settings");
  const hint = it.hint ?? "";
  return (
    <div
      className="irow"
      role="link"
      tabIndex={0}
      onClick={() => navigate(href)}
      onKeyDown={(e) => e.key === "Enter" && navigate(href)}
    >
      <span className="mono small">{it.key}</span>
      <span
        className={`st ${it.action === "deleted" ? "in_review" : "blocked"}`}
      >
        {t(`focus.action.${it.action}`)}
      </span>
      <span className="ellipsis mono small">{it.title}</span>
      <span className="small t2 ellipsis" title={hint}>
        {hint}
      </span>
      <span className="small muted">
        <Icon name="clock" size={14} />{" "}
        {duration(it.waitingSince, i18n.language)}
      </span>
    </div>
  );
}

function AgentFocusRow({ it }: { it: FocusItem }) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const href =
    it.kind === "mcp_server"
      ? adminPath("agent/mcp")
      : adminPath("agent/connections");
  const hint = it.hint
    ? t(`llm.status.${it.hint}`, { defaultValue: it.hint })
    : "";
  return (
    <div
      className="irow"
      role="link"
      tabIndex={0}
      onClick={() => navigate(href)}
      onKeyDown={(e) => e.key === "Enter" && navigate(href)}
    >
      <span className="mono small">
        {it.kind === "agent" ? t("focus.agent") : it.title}
      </span>
      <span className="st blocked">{t(`focus.action.${it.action}`)}</span>
      <span className="ellipsis">
        {it.kind === "agent" ? t("focus.agentHint") : it.title}
      </span>
      <span className="small t2 ellipsis" title={hint}>
        {hint}
      </span>
      <span className="small muted">
        <Icon name="clock" size={14} />{" "}
        {duration(it.waitingSince, i18n.language)}
      </span>
    </div>
  );
}

/** "Overview": active issues, features and releases in three columns (R37). */
export function OverviewPage() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const domain = params.get("domain") ?? "mine";
  const domains = useDomains();
  const ov = useOverview(domain);
  useGeneralChat();
  return (
    <main className="main wide">
      <GeneralTabs />
      <div className="filters">
        <div className="chips" role="group" aria-label={t("home.domains")}>
          <span className="lbl">{t("home.domains")}</span>
          {["mine", "all"].map((d) => (
            <button
              key={d}
              className={`chip${domain === d ? " on" : ""}`}
              onClick={() => setParams({ domain: d }, { replace: true })}
            >
              {t(`home.domain.${d}`)}
            </button>
          ))}
          {domains.data?.map((d) => (
            <button
              key={d.key}
              className={`chip${domain === d.key ? " on" : ""}`}
              onClick={() => setParams({ domain: d.key }, { replace: true })}
            >
              {d.key}
            </button>
          ))}
        </div>
      </div>
      {ov.isLoading && <Loading />}
      {ov.data && (
        <div className="board">
          <Column title={t("stages.research")} count={ov.data.issues.length}>
            {ov.data.issues.map((c) => (
              <IssueCardMini key={c.key} c={c} />
            ))}
          </Column>
          <Column
            title={t("stages.development")}
            count={ov.data.features.length}
          >
            {ov.data.features.map((c) => (
              <FeatureCardMini key={c.key} c={c} />
            ))}
          </Column>
          <Column title={t("stages.delivery")} count={ov.data.releases.length}>
            {ov.data.releases.map((c) => (
              <ReleaseCardMini key={c.key} c={c} />
            ))}
          </Column>
        </div>
      )}
    </main>
  );
}

function Column({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <section className="col">
      <h3 className="stagehead">
        {title} <small>{count}</small>
      </h3>
      {count === 0 ? (
        <div className="small muted" style={{ padding: "8px 2px" }}>
          {t("focus.nothing")}
        </div>
      ) : (
        children
      )}
    </section>
  );
}

function IssueCardMini({ c }: { c: OverviewCard }) {
  return (
    <Link className="card mini" to={keyHref(c.key)}>
      <div className="row">
        <KeyLink k={c.key} plain />
        {c.type && <IssueTypeBadge type={c.type} />}
      </div>
      <div className="title">{c.title}</div>
      <div className="row">
        <IssueStatusBadge status={c.status} />
        {c.blocked && <Icon name="alert" size={14} />}
      </div>
    </Link>
  );
}

function FeatureCardMini({ c }: { c: OverviewCard }) {
  return (
    <Link className="card mini" to={keyHref(c.key)}>
      <div className="row">
        <KeyLink k={c.key} plain />
        <KeyList keys={c.issues} plain />
      </div>
      <div className="title">{c.title}</div>
      <div className="row">
        <PhaseBadge phase={c.status} />
        {c.blocked && <Icon name="alert" size={14} />}
      </div>
      <Progress done={c.done} total={c.total} />
    </Link>
  );
}

function ReleaseCardMini({ c }: { c: OverviewCard }) {
  return (
    <Link className="card mini" to={keyHref(c.key)}>
      <div className="row">
        <KeyLink k={c.key} plain />
        {c.feature && <KeyLink k={c.feature} plain />}
      </div>
      <div className="title">{c.title}</div>
      <div className="row">
        <KeyList keys={c.issues} plain />
      </div>
      <div className="row">
        <ReleaseStatusBadge status={c.status} blocked={c.blocked} />
      </div>
      <Progress done={c.done} total={c.total} />
    </Link>
  );
}
