import { Fragment } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";
import { keys } from "../api/queries";
import type { DiffLine, DiffResult } from "../api/types";
import { errorText } from "../lib/errors";
import { relativeTime, shortSha } from "../lib/format";
import { Icon, Loading } from "@green-on-grey/ui-kit";

const CONTEXT = 2;

/** Groups the line diff by document section and keeps a little context around changes. */
export function hunks(lines: DiffLine[]): { section: string; lines: (DiffLine | null)[] }[] {
  const out: { section: string; lines: (DiffLine | null)[] }[] = [];
  const keep = lines.map((_, i) => lines.slice(Math.max(0, i - CONTEXT), i + CONTEXT + 1).some((l) => l.op !== "="));
  let last = -2;
  lines.forEach((l, i) => {
    if (!keep[i]) return;
    const section = l.section ?? "";
    let block = out[out.length - 1];
    if (!block || block.section !== section) {
      block = { section, lines: [] };
      out.push(block);
    } else if (i !== last + 1) {
      block.lines.push(null); // gap marker
    }
    block.lines.push(l);
    last = i;
  });
  return out;
}

export function DiffPage() {
  const { t, i18n } = useTranslation();
  const { uniqueId = "", area = "" } = useParams();
  const diff = useQuery({
    queryKey: keys.diff(uniqueId, area),
    queryFn: () => api.get<DiffResult>(`/api/v1/features/${uniqueId}/gates/${area}/diff`),
  });
  const d = diff.data;
  const blocks = d ? hunks(d.lines) : [];
  return (
    <main className="main">
      <div className="crumbs">
        <Link to={`/features/${uniqueId}/spec/${area}`} aria-label={t("common.back")}><Icon name="back" size={16} /></Link>
        <span className="fid">{uniqueId}</span> {t(`areas.${area}`)}
      </div>
      {diff.isLoading && <Loading />}
      {diff.error && <div className="banner warn">{errorText(t, diff.error)}</div>}
      {d && (
        <>
          <h1 className="ftitle" style={{ fontSize: 20 }}>
            {d.baseLabel === "approved" && d.approvedAt
              ? t("diff.sinceApproval", { when: relativeTime(d.approvedAt, i18n.language) })
              : t("diff.sinceDefault")}
          </h1>
          <div className="meta" style={{ marginBottom: 16 }}>
            {d.baseLabel === "approved" ? (
              <span>
                {t("diff.approvedBy", { name: d.approvedBy ?? "" })} <a href={d.baseUrl} target="_blank" rel="noreferrer">{shortSha(d.base)}</a>
                {", "}{t("diff.now")} <a href={d.headUrl} target="_blank" rel="noreferrer">{shortSha(d.head)}</a>
              </span>
            ) : (
              <span>{t("diff.baseBranch", { branch: d.base })}{d.head && <>{", "}{t("diff.now")} <a href={d.headUrl} target="_blank" rel="noreferrer">{shortSha(d.head)}</a></>}</span>
            )}
          </div>
          {blocks.length === 0 ? (
            <div className="empty dashed"><b>{t("diff.none")}</b></div>
          ) : (
            <div className="diff">
              {blocks.map((b, bi) => (
                <Fragment key={bi}>
                  <div className="hd">{b.section || t("diff.top")}</div>
                  {b.lines.map((l, i) =>
                    l === null ? <div key={i} className="gap">⋯</div> : (
                      <div key={i} className={`ln${l.op === "+" ? " add" : l.op === "-" ? " del" : ""}`}>
                        <span>{l.op === "+" ? "+" : l.op === "-" ? "−" : ""}</span>
                        <span>{l.text || " "}</span>
                      </div>
                    ),
                  )}
                </Fragment>
              ))}
            </div>
          )}
        </>
      )}
    </main>
  );
}
