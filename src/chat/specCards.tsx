import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Icon, Markdown } from "@green-on-grey/ui-kit";
import { useSpecRequest } from "../api/queries";
import type { NabuMessage, SpecNoticePayload } from "../api/types";
import { RequestStateBadge } from "./discoveryCards";

// FTR.HMR.DEV-0001 design §3.3: the instruction of the personal agent to the
// writer is a card under the answer; the result comes as a notice drawn as the
// card of the result.

/** The tool of the personal agent that gives an instruction to the writer. */
export const SPEC_REVISION_TOOL = "request_spec_revision";

const REQUEST_ID = /"requestId":"([0-9a-f-]{36})"/;

/** The instruction given in an answer of the agent: the id from the result of the step. */
export function specRequestId(m: Pick<NabuMessage, "toolSteps">): string | undefined {
  for (const s of m.toolSteps ?? []) {
    if (s.tool.endsWith(SPEC_REVISION_TOOL) && s.status === "done") {
      const id = REQUEST_ID.exec(s.summary)?.[1];
      if (id) return id;
    }
  }
  return undefined;
}

/** The kind of a notice of the writer, if it is one. */
export function specNotice(m: Pick<NabuMessage, "role" | "payload">): SpecNoticePayload | undefined {
  const p = m.payload as Partial<SpecNoticePayload> | null | undefined;
  return m.role === "notice" && (p?.kind === "spec.revision" || p?.kind === "spec.failed" || p?.kind === "spec.conflict") ? (p as SpecNoticePayload) : undefined;
}

/** The content of an answer of the agent with an instruction to the writer. */
export function specRevisionContent(m: NabuMessage): ReactNode | undefined {
  const id = specRequestId(m);
  if (!id) return undefined;
  return (
    <>
      {m.text && <div className="bub"><Markdown text={m.text} /></div>}
      <SpecTaskCard requestId={id} />
    </>
  );
}

/** The content of a notice of the writer: the card of the result. */
export function specNoticeContent(m: NabuMessage): ReactNode | undefined {
  const p = specNotice(m);
  return p ? <SpecResultCard text={m.text} payload={p} /> : undefined;
}

/** The longest instruction shown whole (as the card of Discovery). */
const CLAMP_LINES = 6;

export function SpecTaskCard({ requestId }: { requestId: string }) {
  const { t } = useTranslation();
  const req = useSpecRequest(requestId);
  const [full, setFull] = useState(false);
  const r = req.data;
  const text = [r?.context ?? "", r?.instructions ?? ""].join("\n");
  const long = text.split("\n").length > CLAMP_LINES || text.length > 420;
  const clamp = long && !full ? " clamp" : "";
  return (
    <div className="taskcard" role="group" aria-label={t("writer.task.title")}>
      <div className="th"><Icon name="spark" size={14} />{t("writer.task.title")}</div>
      {(r?.areas?.length ?? 0) > 0 && (
        <div className="taskgates">{r!.areas.map((a) => <span key={a} className="taskgate">{t(`areas.${a}`)}</span>)}</div>
      )}
      {(r?.answers?.length ?? 0) > 0 && (
        <ul className="briefans">
          <li className="lbl">{t("disc.task.answers")}</li>
          {r!.answers!.map((a) => (
            <li key={`${a.area}-${a.questionId}`}><span className="fid">{a.questionId}</span><span>{a.answer}</span>
              <span className={`st ${a.source === "memory" ? "handed" : "approved"}`}>{t(`disc.task.source.${a.source}`)}</span></li>
          ))}
        </ul>
      )}
      {r?.context && <><div className="briefl">{t("disc.task.context")}</div><div className={`tx${clamp}`}>{r.context}</div></>}
      {r?.instructions && (r.answers?.length || r.context) ? <div className="briefl">{t("disc.task.also")}</div> : null}
      {r?.instructions && <div className={`tx${clamp}`}>{r.instructions}</div>}
      {long && <button type="button" className="linkbtn" onClick={() => setFull((v) => !v)}>{t(full ? "disc.task.less" : "disc.task.more")}</button>}
      <div className="tf">
        {req.isLoading && <span className="st draft">…</span>}
        {r && <RequestStateBadge state={r.state} />}
        {r?.state === "queued" && <span>{t(r.blocked ? "writer.task.afterRetry" : "disc.task.afterCurrent")}</span>}
        {r && r.state !== "queued" && r.state !== "running" && <Link to={`/features/${r.featureKey}`}>{t("writer.task.open")}</Link>}
      </div>
    </div>
  );
}

export function SpecResultCard({ text, payload }: { text: string; payload: SpecNoticePayload }) {
  const { t } = useTranslation();
  const tone = payload.kind === "spec.failed" ? " bad" : payload.kind === "spec.conflict" ? " warn" : "";
  const area = payload.areas[0] ?? payload.otherAreas[0];
  return (
    <div className={`resultcard${tone}`}>
      <Markdown text={text} />
      {payload.kind !== "spec.failed" && area && (
        <Link to={`/features/${payload.featureKey}/spec/${area}${payload.kind === "spec.revision" ? "/diff" : ""}`}>
          {t(payload.kind === "spec.revision" ? "writer.result.changes" : "writer.result.open")}
        </Link>
      )}
    </div>
  );
}
