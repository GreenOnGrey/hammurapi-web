import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Icon, Markdown } from "@green-on-grey/ui-kit";
import { useDiscoveryRequest } from "../api/queries";
import type { DiscoveryNoticePayload, DiscoveryRequest, NabuMessage } from "../api/types";

// FTR.HMR.DISC-0001 design §3.3: the instruction of the personal agent to the
// researcher is a card under the answer, its state changes in place; the
// result comes as a notice of Hammurapi drawn as the card of the result.

/** The tool of the personal agent that gives an instruction. */
export const REVISION_TOOL = "request_discovery_revision";

const UUID = /"requestId":"([0-9a-f-]{36})"/;

/** The instruction given in an answer of the agent: the id from the result of the step. */
export function revisionRequestId(m: Pick<NabuMessage, "toolSteps">): string | undefined {
  for (const s of m.toolSteps ?? []) {
    if (s.tool.endsWith(REVISION_TOOL) && s.status === "done") {
      const id = UUID.exec(s.summary)?.[1];
      if (id) return id;
    }
  }
  return undefined;
}

/** The kind of a notice of Hammurapi about Discovery, if it is one. */
export function discoveryNotice(m: Pick<NabuMessage, "role" | "payload">): DiscoveryNoticePayload | undefined {
  const p = m.payload as Partial<DiscoveryNoticePayload> | null | undefined;
  return m.role === "notice" && (p?.kind === "discovery.revision" || p?.kind === "discovery.failed") ? (p as DiscoveryNoticePayload) : undefined;
}

/** The content of an answer of the agent with an instruction: its text and the card. */
export function revisionContent(m: NabuMessage): ReactNode | undefined {
  const id = revisionRequestId(m);
  if (!id) return undefined;
  return (
    <>
      {m.text && <div className="bub"><Markdown text={m.text} /></div>}
      <RevisionTaskCard requestId={id} />
    </>
  );
}

/** The content of a notice of Discovery: the card of the result; another notice is drawn by the kit. */
export function noticeContent(m: NabuMessage): ReactNode | undefined {
  const p = discoveryNotice(m);
  return p ? <DiscoveryResultCard text={m.text} payload={p} /> : undefined;
}

/** The longest instruction shown whole (design §3.3: six lines). */
const CLAMP_LINES = 6;

export function RevisionTaskCard({ requestId }: { requestId: string }) {
  const { t } = useTranslation();
  const req = useDiscoveryRequest(requestId);
  const [full, setFull] = useState(false);
  const r = req.data;
  // the context and the instruction of a brief fold alike (design §3.3)
  const text = [r?.context ?? "", r?.instructions ?? ""].join("\n");
  const long = text.split("\n").length > CLAMP_LINES || text.length > 420;
  const clamp = long && !full ? " clamp" : "";
  return (
    <div className="taskcard" role="group" aria-label={t("disc.task.title")}>
      <div className="th"><Icon name="spark" size={14} />{t("disc.task.title")}</div>
      {/* FTR.HMR.DISC-0001 R28, design §3.3: the answers of the brief with where they come from */}
      {(r?.answers?.length ?? 0) > 0 && (
        <ul className="briefans">
          <li className="lbl">{t("disc.task.answers")}</li>
          {r!.answers!.map((a) => (
            <li key={a.questionId}><span className="fid">{a.questionId}</span><span>{a.answer}</span>
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
        {r?.state === "queued" && <span>{t("disc.task.afterCurrent")}</span>}
        {r?.state === "done" && <Link to={`/issues/${r.issueKey}`}>{t("disc.revision", { n: r.revision })}</Link>}
        {r?.state === "failed" && <Link to={`/issues/${r.issueKey}`}>{t("disc.task.details")}</Link>}
      </div>
    </div>
  );
}

/** The state of an instruction: queued, running, done or failed (design §3.3). */
export function RequestStateBadge({ state }: { state: DiscoveryRequest["state"] }) {
  const { t } = useTranslation();
  switch (state) {
    case "queued": return <span className="st draft">{t("disc.task.queued")}</span>;
    case "running": return <span className="st disc"><span className="ring tiny" aria-hidden="true" />{t("disc.task.running")}</span>;
    case "done": return <span className="st approved">{t("disc.task.done")}</span>;
    case "failed": return <span className="st blocked">{t("disc.task.failed")}</span>;
  }
}

export function DiscoveryResultCard({ text, payload }: { text: string; payload: DiscoveryNoticePayload }) {
  const { t } = useTranslation();
  const failed = payload.kind === "discovery.failed";
  return (
    <div className={`resultcard${failed ? " bad" : ""}`}>
      <Markdown text={text} />
      {!failed && payload.revision > 0 && (
        <Link to={`/issues/${payload.issueKey}`}>{t("disc.openRevision", { n: payload.revision })}</Link>
      )}
    </div>
  );
}
