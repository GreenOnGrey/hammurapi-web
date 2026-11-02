import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Icon, useToast } from "@green-on-grey/ui-kit";
import { api } from "../../api/client";
import { invalidateFeature, keys, useSpecQuestions, useSpecRequest } from "../../api/queries";
import type { Area, SpecGateQuestions } from "../../api/types";
import { errorText } from "../../lib/errors";
import { RequestStateBadge } from "../../chat/discoveryCards";
import { answersBody, dropOldDrafts, loadDraft, QuestionCard, saveDraft, type Choice, type Draft } from "../IssueQuestions";

// FTR.HMR.DEV-0001 R10–R12, design §3.4: the questions of the writer about a
// gate, over the document: while a gate is worked on an answer matters more
// than reading. An expert answers the questions addressed to his kind.

export function SpecQuestions({ featureKey, area, highlighted }: { featureKey: string; area: Area; highlighted?: string }) {
  const { t } = useTranslation();
  const list = useSpecQuestions(featureKey);
  const gate = list.data?.items.find((g) => g.area === area);
  if (list.error) return <div className="err-text">{errorText(t, list.error)}</div>;
  if (!gate) return null;
  // a new round mounts the block anew with its own draft
  const ids = gate.questions.map((q) => q.id).join(",");
  return <GateQuestions key={`${area}:${gate.round}:${ids}`} featureKey={featureKey} gate={gate} highlighted={highlighted} />;
}

function GateQuestions({ featureKey, gate, highlighted }: { featureKey: string; gate: SpecGateQuestions; highlighted?: string }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const toast = useToast();
  const scope = `${featureKey}:${gate.area}`;
  const rev = gate.round;
  const [draft, setDraft] = useState<Draft>(() => loadDraft(scope, rev));
  useEffect(() => dropOldDrafts(scope, rev), [scope, rev]);
  const update = (next: Draft) => {
    setDraft(next);
    saveDraft(scope, rev, next);
  };
  const qs = gate.questions;
  const body = answersBody(draft, qs.filter((q) => q.canAnswer));
  const send = useMutation({
    mutationFn: () => api.post<{ requestId: string }>(`/api/v1/features/${featureKey}/spec/answers`, {
      area: gate.area,
      answers: body.answers.map((a) => ({ ...a, allowTouches: !!draft.allow?.[a.questionId] })),
    }),
    onSuccess: (r) => {
      update({ ...draft, sent: { requestId: r.requestId, ids: body.answers.map((a) => a.questionId) } });
      invalidateFeature(qc, featureKey);
      qc.invalidateQueries({ queryKey: keys.specQuestions(featureKey) });
    },
    onError: (e) => toast({ kind: "error", title: errorText(t, e) }),
  });
  const sent = draft.sent;
  const choose = (id: string, c?: Choice) => {
    const answers = { ...draft.answers };
    if (c) answers[id] = c;
    else delete answers[id];
    update({ ...draft, answers });
  };
  const canAny = !sent && qs.some((q) => q.canAnswer);
  return (
    <section className="docsec qblock specq">
      <h5 className="qblockh">
        {t("writer.q.title", { area: t(`areas.${gate.area}`) })}
        <span className="qround">{t("writer.q.round", { n: gate.round, left: gate.roundsLeft })}</span>
      </h5>
      {qs.map((q) => {
        const canAllow = !sent && q.canAnswer && (q.touches?.length ?? 0) > 0;
        return (
          <QuestionCard key={q.id} q={q} c={draft.answers[q.id]} editable={!sent && q.canAnswer} highlighted={highlighted === q.id}
            sentId={sent?.ids.includes(q.id) ? sent.requestId : undefined} onChoose={(c) => choose(q.id, c)}
            badge={q.forOthers ? <span className="qaud">{t(`writer.q.audience.${q.audience}`)}</span> : undefined}
            note={(
              <>
                {(q.touches?.length ?? 0) > 0 && !canAllow && <div className="qwhy small muted">{t("writer.q.touches", { list: q.touches!.map((a) => t(`areas.${a}`)).join(", ") })}</div>}
                {/* R21: the model names the gate, a person decides that it may change */}
                {canAllow && (
                  <label className="qallow small">
                    <input type="checkbox" checked={!!draft.allow?.[q.id]} onChange={(e) => update({ ...draft, allow: { ...draft.allow, [q.id]: e.target.checked } })} />
                    {t("writer.q.allow", { list: q.touches!.map((a) => t(`areas.${a}`)).join(", ") })}
                  </label>
                )}
                {!q.canAnswer && <div className="qwhy small muted">{t(`writer.q.answeredBy.${q.audience}`)}</div>}
              </>
            )}
            choicesOnly={!!q.skipArea}
            sentBadge={(id) => <SpecRequestBadge requestId={id} />} />
        );
      })}
      {canAny && (
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

function SpecRequestBadge({ requestId }: { requestId: string }) {
  const r = useSpecRequest(requestId).data;
  return r ? <RequestStateBadge state={r.state} /> : null;
}
