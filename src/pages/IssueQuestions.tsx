import { useEffect, useRef, useState, type MouseEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Icon, useToast } from "@green-on-grey/ui-kit";
import { api } from "../api/client";
import { invalidateCycle, keys, useDiscoveryRequest } from "../api/queries";
import type { DiscoveryQuestion, DiscoveryView } from "../api/types";
import { errorText } from "../lib/errors";
import { RequestStateBadge } from "../chat/discoveryCards";

// FTR.HMR.DISC-0001 R26–R27, design §3.6c: the open questions of the
// researcher, a round at a time; an expert answers on the page of the issue
// and the answers go to the researcher as one instruction.

/** The choice of an expert for a question. */
export type Choice = { choice: "recommended" } | { choice: "option"; option: number } | { choice: "own"; text: string };

/** The answers not sent yet and the instruction they went with. */
export interface Draft {
  answers: Record<string, Choice>;
  sent?: { requestId: string; ids: string[] };
}

// The draft lives in the browser of the expert until a new revision
// (tech §7.2); without the storage the block works, the draft is not kept.
const draftKey = (issueKey: string, revision: number) => `discovery-answers:${issueKey}:${revision}`;

export function loadDraft(issueKey: string, revision: number): Draft {
  try {
    const raw = localStorage.getItem(draftKey(issueKey, revision));
    if (raw) return JSON.parse(raw) as Draft;
  } catch {
    // no storage or a broken draft: start anew
  }
  return { answers: {} };
}

function saveDraft(issueKey: string, revision: number, d: Draft) {
  try {
    localStorage.setItem(draftKey(issueKey, revision), JSON.stringify(d));
  } catch {
    // the draft is a convenience
  }
}

/** Drafts of former revisions of the issue are dropped: a new revision starts clean (design §3.6c). */
export function dropOldDrafts(issueKey: string, revision: number) {
  try {
    const prefix = draftKey(issueKey, 0).slice(0, -1);
    for (const k of Object.keys(localStorage)) {
      if (k.startsWith(prefix) && k !== draftKey(issueKey, revision)) localStorage.removeItem(k);
    }
  } catch {
    // no storage: nothing to drop
  }
}

/** The text of a choice, as the researcher gets it from the server. */
export function choiceText(q: DiscoveryQuestion, c: Choice): string {
  switch (c.choice) {
    case "recommended": return q.recommended;
    case "option": return q.options[c.option];
    case "own": return c.text.trim();
  }
}

/** The same choice: a second press on it takes it back. */
const sameChoice = (a: Choice, b: Choice) =>
  a.choice === b.choice && (a.choice !== "option" || (b.choice === "option" && a.option === b.option));

/** A choice that can be sent: an own answer needs a text. */
const isAnswered = (q: DiscoveryQuestion, c?: Choice) => !!c && choiceText(q, c) !== "";

/** The body of POST …/discovery/answers (tech §3.5) for the open questions. */
export function answersBody(d: Draft, qs: DiscoveryQuestion[]) {
  return {
    answers: qs.filter((q) => isAnswered(q, d.answers[q.id])).map((q) => {
      const c = d.answers[q.id];
      return c.choice === "own" ? { questionId: q.id, choice: c.choice, text: choiceText(q, c) } : { questionId: q.id, ...c };
    }),
  };
}

/** «(допущение, см. Q5)» in the analysis becomes a link to the open question Q5. */
export function linkQuestions(md: string, ids: string[]): string {
  const open = new Set(ids);
  return md.replace(/(см\.|see)(\s+)(Q\d+)\b/g, (all, see: string, sp: string, id: string) => (open.has(id) ? `${see}${sp}[${id}](#q-${id})` : all));
}

/** The analysis still carries the section of open questions written before R26 (R24); the headings are
 * the ones the core moves to the end (cycledata.openQuestionsRe). */
export const hasQuestionsSection = (md?: string) =>
  /^#{1,6}\s+(?:\d+(?:\.\d+)*\.?\s+)?(?:открытые вопросы|open questions|offene fragen|questions ouvertes|preguntas abiertas|开放问题|未决问题|待解决问题)\s*[:：]?\s*$/imu.test(md ?? "");

/** A click on a link to a question scrolls to its card and lights it up for 1.5 s (design §3.6c). */
export function useQuestionLinks() {
  const [highlighted, setHighlighted] = useState<string>();
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const onClick = (e: MouseEvent) => {
    const a = (e.target as HTMLElement).closest<HTMLAnchorElement>('a[href^="#q-"]');
    if (!a) return;
    e.preventDefault();
    const id = a.getAttribute("href")!.slice(3);
    document.getElementById(`q-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    setHighlighted(id);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setHighlighted(undefined), 1500);
  };
  return { highlighted, onClick };
}

export function QuestionsBlock({ issueKey, d, canAnswer, highlighted }: { issueKey: string; d: DiscoveryView; canAnswer: boolean; highlighted?: string }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const toast = useToast();
  const qs = d.questions ?? [];
  const rev = d.revision ?? 0;
  // a new revision mounts the block anew (key in DiscoveryDoc) with its own draft
  const [draft, setDraft] = useState<Draft>(() => loadDraft(issueKey, rev));
  useEffect(() => dropOldDrafts(issueKey, rev), [issueKey, rev]);
  const update = (next: Draft) => {
    setDraft(next);
    saveDraft(issueKey, rev, next);
  };
  const body = answersBody(draft, qs);
  const send = useMutation({
    mutationFn: () => api.post<{ requestId: string }>(`/api/v1/issues/${issueKey}/discovery/answers`, body),
    onSuccess: (r) => {
      update({ ...draft, sent: { requestId: r.requestId, ids: body.answers.map((a) => a.questionId) } });
      invalidateCycle(qc);
      qc.invalidateQueries({ queryKey: keys.discovery(issueKey) });
    },
    onError: (e) => toast({ kind: "error", title: errorText(t, e) }),
  });
  if (qs.length === 0) {
    if (hasQuestionsSection(d.content)) return null; // the section in the text stays last (R24)
    return (
      <section className="docsec">
        <h5>{t("disc.q.title")}</h5>
        <span className="small muted">{t("disc.q.none")}</span>
      </section>
    );
  }
  const sent = draft.sent;
  const editable = canAnswer && !sent;
  const choose = (id: string, c?: Choice) => {
    const answers = { ...draft.answers };
    if (c) answers[id] = c;
    else delete answers[id];
    update({ ...draft, answers });
  };
  return (
    <section className="docsec qblock">
      <h5 className="qblockh">{t("disc.q.title")}<span className="qround">{t("disc.q.round", { n: d.questionRound ?? 1 })}</span></h5>
      {qs.map((q) => (
        <QuestionCard key={q.id} q={q} c={draft.answers[q.id]} editable={editable} highlighted={highlighted === q.id}
          sentId={sent?.ids.includes(q.id) ? sent.requestId : undefined} onChoose={(c) => choose(q.id, c)} />
      ))}
      {editable && (
        <div className="qfoot">
          <span>{t("disc.q.answered", { n: body.answers.length, total: qs.length })}</span>
          <span className="qgrow small muted">{t("disc.q.later")}</span>
          <button className="btn primary sm qsend" disabled={body.answers.length === 0 || send.isPending} onClick={() => send.mutate()}>
            <Icon name="send" size={14} />{t("disc.q.send")}
          </button>
        </div>
      )}
    </section>
  );
}

const chipClass = (on: boolean) => `chip qchip${on ? " on" : ""}`;

function QuestionCard({ q, c, editable, highlighted, sentId, onChoose }: {
  q: DiscoveryQuestion; c?: Choice; editable: boolean; highlighted: boolean; sentId?: string; onChoose: (c?: Choice) => void;
}) {
  const { t } = useTranslation();
  const toggle = (next: Choice) => onChoose(c && sameChoice(c, next) ? undefined : next);
  const answer = c && choiceText(q, c);
  return (
    <article id={`q-${q.id}`} className={`qcard${highlighted ? " lit" : ""}`}>
      <div className="qhead"><span className="fid">{q.id}</span><b>{q.title}</b></div>
      {q.body && <div className="qbody small t2">{q.body}</div>}
      {!editable && q.options.length > 0 && <div className="small t2">{t("disc.q.options")} {q.options.join(" · ")}</div>}
      <div className="qrec"><Icon name="spark" size={14} /><span><b>{t("disc.q.recommended")}</b> {q.recommended}</span></div>
      {q.why && <div className="qwhy small muted">{q.why}</div>}
      {editable && (
        <div className="chips qchips" role="group" aria-label={q.title}>
          <button type="button" className={chipClass(c?.choice === "recommended")} aria-pressed={c?.choice === "recommended"} onClick={() => toggle({ choice: "recommended" })}>
            <Icon name="check" size={14} />{t("disc.q.accept")}
          </button>
          {q.options.filter((o) => o !== q.recommended).map((o) => {
            const i = q.options.indexOf(o);
            const pressed = c?.choice === "option" && c.option === i;
            return <button key={o} type="button" className={chipClass(pressed)} aria-pressed={pressed} onClick={() => toggle({ choice: "option", option: i })}>{o}</button>;
          })}
          <button type="button" className={chipClass(c?.choice === "own")} aria-pressed={c?.choice === "own"} onClick={() => toggle({ choice: "own", text: "" })}>{t("disc.q.own")}</button>
        </div>
      )}
      {editable && c?.choice === "own" && (
        <textarea className="inp qown" rows={2} autoFocus aria-label={t("disc.q.own")} placeholder={t("disc.q.ownPlaceholder")} value={c.text}
          onChange={(e) => onChoose({ choice: "own", text: e.target.value })} />
      )}
      {sentId && answer && <SentAnswer requestId={sentId} answer={answer} />}
    </article>
  );
}

/** A sent answer with the state of its instruction, as in the card of the instruction (design §3.3). */
function SentAnswer({ requestId, answer }: { requestId: string; answer: string }) {
  const { t } = useTranslation();
  const r = useDiscoveryRequest(requestId).data;
  return (
    <div className="qsent small">
      <span className="t2">{t("disc.q.answer", { text: answer })}</span>
      {r && <RequestStateBadge state={r.state} />}
    </div>
  );
}
