import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api } from "../../api/client";
import { keys } from "../../api/queries";
import { AREAS, type Area, type List, type RuleChange, type RuleFile } from "../../api/types";
import { useSession } from "../../app/session";
import { MarkdownEditor } from "../../editor/MarkdownEditor";
import { errorText } from "../../lib/errors";
import { joinFrontMatter, normalizeEnding, protectPlaceholders, restorePlaceholders, splitFrontMatter } from "../../lib/markdown";
import { relativeTime } from "../../lib/format";
import { Icon } from "../../components/Icon";
import { Loading, Modal, useToast } from "../../components/ui";

/** Rules: changes go to a branch and PR/MR, applied after approval by another admin of the area. */
export function RulesAdmin() {
  const { t } = useTranslation();
  const { me, isAreaAdmin } = useSession();
  const visible = AREAS.filter((a) => me.globalAdmin || isAreaAdmin(a));
  const [area, setArea] = useState<Area>(visible[0] ?? "product");
  if (visible.length === 0) return <p className="muted">{t("admin.noAccess")}</p>;
  return (
    <>
      <h1 className="ftitle" style={{ fontSize: 20 }}>{t("admin.rules.title")}</h1>
      <div className="tabs" role="tablist">
        {visible.map((a) => (
          <button key={a} role="tab" aria-selected={area === a} className={area === a ? "on" : ""} onClick={() => setArea(a)}>{t(`areas.${a}`)}</button>
        ))}
      </div>
      <AreaRules key={area} area={area} />
    </>
  );
}

function AreaRules({ area }: { area: Area }) {
  const { t, i18n } = useTranslation();
  const { me } = useSession();
  const qc = useQueryClient();
  const toast = useToast();
  const [file, setFile] = useState<"template" | "fix-template">("template");
  const [viewing, setViewing] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const rules = useQuery({
    queryKey: keys.rules(area),
    queryFn: () => api.get<{ area: Area; files: RuleFile[]; canChange: boolean }>(`/admin/api/v1/rules/${area}`),
  });
  const changes = useQuery({
    queryKey: keys.ruleChanges(area),
    queryFn: () => api.get<List<RuleChange>>(`/admin/api/v1/rules/changes?area=${area}&limit=100`),
  });
  const open = changes.data?.items.filter((c) => c.status === "open") ?? [];
  const closed = changes.data?.items.filter((c) => c.status !== "open") ?? [];
  const refresh = () => {
    qc.invalidateQueries({ queryKey: keys.rules(area) });
    qc.invalidateQueries({ queryKey: keys.ruleChanges(area) });
  };
  const decide = useMutation({
    mutationFn: ({ id, action }: { id: string; action: "approve" | "withdraw" }) => api.post(`/admin/api/v1/rules/changes/${id}/${action}`),
    onSuccess: (_, v) => {
      refresh();
      toast({ kind: "ok", title: v.action === "approve" ? t("admin.rules.applied") : t("admin.rules.withdrawn") });
    },
    onError: (e) => toast({ kind: "error", title: errorText(t, e) }),
  });

  if (rules.isLoading) return <Loading />;
  if (!rules.data) return <div className="banner warn">{errorText(t, rules.error)}</div>;
  const current = rules.data.files.find((f) => f.file === file)!;
  const openForFile = open.find((c) => c.file === file);

  return (
    <>
      {open.length > 0 && (
        <div className="approvals" style={{ marginBottom: 16 }}>
          <div className="head"><h2 className="sec" style={{ margin: 0 }}>{t("admin.rules.pending")} <span className="count">{open.length}</span></h2></div>
          {open.map((c) => (
            <div key={c.id} className="it" style={{ gridTemplateColumns: "minmax(0, 1fr) 150px 90px auto" }}>
              <span>{t(`admin.rules.files.${c.file}`)}{c.comment && <div className="small muted">«{c.comment}»</div>}</span>
              <span className="small t2">{c.author}, {relativeTime(c.createdAt, i18n.language)}</span>
              <a className="sha" href={c.prUrl} target="_blank" rel="noreferrer">PR/MR #{c.prNumber}</a>
              <span className="row" style={{ flexWrap: "nowrap" }}>
                <button className="btn sm" onClick={() => setViewing(c.id)}>{t("admin.rules.viewDiff")}</button>
                {c.authorId === me.id ? (
                  <button className="btn sm" disabled={decide.isPending} onClick={() => decide.mutate({ id: c.id, action: "withdraw" })}>{t("admin.rules.withdraw")}</button>
                ) : rules.data.canChange && (
                  <button className="btn ok sm" disabled={decide.isPending} onClick={() => decide.mutate({ id: c.id, action: "approve" })}>
                    <Icon name="check" size={15} />{t("admin.rules.approve")}
                  </button>
                )}
              </span>
            </div>
          ))}
        </div>
      )}
      <div className="chips" style={{ marginBottom: 12 }}>
        {(["template", "fix-template"] as const).map((f) => (
          <button key={f} className={`chip${file === f ? " on" : ""}`} onClick={() => setFile(f)}>{t(`admin.rules.files.${f}`)}</button>
        ))}
        <span className="small muted" style={{ marginLeft: "auto" }}><span className="mono">/{current.path}</span></span>
      </div>
      <RuleEditor key={`${file}-${current.sha}`} area={area} rule={current} canChange={rules.data.canChange} blocked={!!openForFile} onProposed={refresh} />
      <div className="row" style={{ marginTop: 10 }}>
        <button className="btn ghost sm" onClick={() => setShowHistory((v) => !v)}>{t("admin.rules.history")}</button>
      </div>
      {showHistory && (
        <div className="hist" style={{ marginTop: 8 }}>
          {closed.length === 0 && <p className="muted small">{t("admin.rules.noHistory")}</p>}
          {closed.map((c) => (
            <div key={c.id} className="h">
              <span>{c.status === "merged" ? <Icon name="check" /> : <Icon name="x" />}</span>
              <div>
                {t(`admin.rules.files.${c.file}`)} · {t(`admin.rules.status.${c.status}`)} · {c.author}{c.approvedBy && ` → ${c.approvedBy}`}
                <div className="muted">{relativeTime(c.closedAt ?? c.createdAt, i18n.language)}{c.comment && ` · «${c.comment}»`}</div>
              </div>
              <a className="sha" href={c.prUrl} target="_blank" rel="noreferrer">#{c.prNumber}</a>
            </div>
          ))}
        </div>
      )}
      {viewing && <ChangeDiffModal id={viewing} onClose={() => setViewing(null)} />}
    </>
  );
}

/** The link to the pull request with a proposed change, for the toast. */
function prLink(url: string) {
  return <a href={url} target="_blank" rel="noreferrer">{url}</a>;
}

function RuleEditor({ area, rule, canChange, blocked, onProposed }: {
  area: Area; rule: RuleFile; canChange: boolean; blocked: boolean; onProposed: () => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const split = splitFrontMatter(rule.content);
  const [content, setContent] = useState<string | null>(null);
  const [baseline, setBaseline] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const propose = useMutation({
    mutationFn: () => api.post<{ id: string; prUrl: string }>(`/admin/api/v1/rules/${area}/changes`, {
      file: rule.file, content: joinFrontMatter(split.front, normalizeEnding(restorePlaceholders(content ?? ""))), baseSha: rule.sha, comment,
    }),
    onSuccess: (r) => {
      toast({ kind: "ok", title: t("admin.rules.proposed"), text: prLink(r.prUrl) });
      setComment("");
      onProposed();
    },
    onError: (e) => toast({ kind: "error", title: errorText(t, e) }),
  });
  const dirty = content !== null && baseline !== null && content !== baseline;
  const readOnly = !canChange || blocked;
  return (
    <>
      {blocked && <div className="banner">{t("admin.rules.blocked")}</div>}
      {!canChange && <div className="banner">{t("admin.rules.readOnly")}</div>}
      <div className="codeedit doc" style={{ maxWidth: "none" }}>
        <MarkdownEditor value={protectPlaceholders(split.body)} readOnly={readOnly} ariaLabel={t(`admin.rules.files.${rule.file}`)}
          onReady={(n) => { setBaseline(n); setContent(n); }} onChange={setContent} />
      </div>
      {canChange && (
        <>
          <div className="field" style={{ marginTop: 14 }}>
            <label htmlFor="rule-comment">{t("admin.rules.comment")}</label>
            <input id="rule-comment" className="inp" value={comment} placeholder={t("admin.rules.commentHint")} onChange={(e) => setComment(e.target.value)} />
          </div>
          <div className="row" style={{ justifyContent: "flex-end" }}>
            <span className="small muted" style={{ marginRight: "auto" }}>{t("admin.rules.appliesAfter", { area: t(`areas.${area}`) })}</span>
            <button className="btn primary sm" disabled={!dirty || blocked || propose.isPending} onClick={() => propose.mutate()}>{t("admin.rules.propose")}</button>
          </div>
        </>
      )}
    </>
  );
}

function ChangeDiffModal({ id, onClose }: { id: string; onClose: () => void }) {
  const { t } = useTranslation();
  const change = useQuery({ queryKey: ["admin", "ruleChange", id], queryFn: () => api.get<RuleChange>(`/admin/api/v1/rules/changes/${id}`) });
  return (
    <Modal title={t("admin.rules.diffTitle")} wide onClose={onClose} footer={<button className="btn" onClick={onClose}>{t("common.close")}</button>}>
      {change.isLoading && <Loading />}
      {change.data && (
        <div className="diff" style={{ maxHeight: "60vh", overflowY: "auto" }}>
          {change.data.lines?.map((l, i) => (
            <div key={i} className={`ln${l.op === "+" ? " add" : l.op === "-" ? " del" : ""}`}>
              <span>{l.op === "+" ? "+" : l.op === "-" ? "−" : ""}</span><span>{l.text || " "}</span>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
