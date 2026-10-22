import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Icon, Markdown } from "@green-on-grey/ui-kit";
import { useDiscoveryRequest } from "../api/queries";
import type { DiscoveryNoticePayload, NabuMessage } from "../api/types";

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
  const long = (r?.instructions.split("\n").length ?? 0) > CLAMP_LINES || (r?.instructions.length ?? 0) > 420;
  return (
    <div className="taskcard" role="group" aria-label={t("disc.task.title")}>
      <div className="th"><Icon name="spark" size={14} />{t("disc.task.title")}</div>
      {r && <div className={`tx${long && !full ? " clamp" : ""}`}>{r.instructions}</div>}
      {long && <button type="button" className="linkbtn" onClick={() => setFull((v) => !v)}>{t(full ? "disc.task.less" : "disc.task.more")}</button>}
      <div className="tf">
        {req.isLoading && <span className="st draft">…</span>}
        {r?.state === "queued" && <><span className="st draft">{t("disc.task.queued")}</span><span>{t("disc.task.afterCurrent")}</span></>}
        {r?.state === "running" && <span className="st disc"><span className="ring tiny" aria-hidden="true" />{t("disc.task.running")}</span>}
        {r?.state === "done" && (
          <><span className="st approved">{t("disc.task.done")}</span>
            <Link to={`/issues/${r.issueKey}`}>{t("disc.revision", { n: r.revision })}</Link></>
        )}
        {r?.state === "failed" && (
          <><span className="st blocked">{t("disc.task.failed")}</span>
            <Link to={`/issues/${r.issueKey}`}>{t("disc.task.details")}</Link></>
        )}
      </div>
    </div>
  );
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
