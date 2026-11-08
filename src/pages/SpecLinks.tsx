import { useState } from "react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Icon } from "@green-on-grey/ui-kit";
import type { SpecFeatureLinks, SpecLinkRef } from "../api/types";

const ROWS = ["extends", "changes", "extendedBy", "changedBy"] as const;
const MAX = 5;

/** The links of a feature in the header of a document (FTR.HMR.DEV-0002 R14, R17, design §3.5):
 * up to four rows, a plate per feature; a key outside the index is a plate without a link. The rows are folded
 * by default; the button of the graph stands next to the fold, not in it, so it is not a part of the toggle. */
export function SpecLinks({ links, featureKey }: { links?: SpecFeatureLinks; featureKey: string }) {
  const { t } = useTranslation();
  if (!links || ROWS.every((r) => links[r].length === 0)) return null;
  const count = ROWS.reduce((n, r) => n + links[r].length, 0);
  return (
    <div className="speclinksfold">
      {/* R16: the graph with the focus on this feature; not on a phone (design §3.7) */}
      <Link className="btn ghost sm specgraphbtn specshowgraph" to={`/spec/graph?focus=${encodeURIComponent(featureKey)}`}>
        <Icon name="graph" size={14} />{t("spec.graph.show")}
      </Link>
      <details className="fold">
        <summary>{t("spec.links.title")} <span className="foldcount">{count}</span></summary>
        <LinkRows links={links} />
      </details>
    </div>
  );
}

/** The rows of the links of a feature, one per kind that has links: in the header of a document and in the list
 * under the graph (design §3.5, §3.6). */
export function LinkRows({ links }: { links: SpecFeatureLinks }) {
  const { t } = useTranslation();
  return ROWS.filter((r) => links[r].length > 0).map((r) => (
    <LinkRefs key={r} label={t(`spec.links.${r}`)} refs={links[r]} withReqs={r === "changes" || r === "changedBy"} anchored={r === "changes"} />
  ));
}

// The requirements of a link are numbers in the changed feature: the plate of «Changes» goes to the first of them,
// the plate of «Changed by» to the changing feature without an anchor (they are numbers of the document open now).
function LinkRefs({ label, refs, withReqs, anchored }: { label: string; refs: SpecLinkRef[]; withReqs: boolean; anchored: boolean }) {
  const { t } = useTranslation();
  const [all, setAll] = useState(false);
  const shown = all ? refs : refs.slice(0, MAX);
  return (
    <LinkRow label={label}>
      {shown.map((r) => {
        const body = (
          <>
            <span className="mono lnk-k">{r.key}</span>
            {withReqs && r.requirements.length > 0 && <span className="mono"> · {r.requirements.join(", ")}</span>}
            {r.title && <span className="lnk-t">{r.title}</span>}
          </>
        );
        if (!r.indexed) {
          return <span key={r.key} className="chip lnkchip lnk-off" title={t("spec.links.notIndexed")}>{body}</span>;
        }
        const anchor = anchored && r.requirements[0] ? `#${r.requirements[0].toLowerCase()}` : "";
        // a long title is cut to the width of the column (design §3.5): the whole of it is in the tooltip
        return <Link key={r.key} className="chip lnkchip" to={`/spec/${r.key}/product${anchor}`} title={r.title ? `${r.key} ${r.title}` : undefined}>{body}</Link>;
      })}
      {!all && refs.length > MAX && (
        <button type="button" className="chip" onClick={() => setAll(true)}>{t("spec.links.more", { count: refs.length - MAX })}</button>
      )}
    </LinkRow>
  );
}

/** A row of the header of a document: a label and plates (FTR.HMR.CMN-0005 design §3). */
export function LinkRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="row speclinks">
      <span className="small muted">{label}</span>
      <span className="chips lnkchips">{children}</span>
    </div>
  );
}

/** The id of a requirement paragraph, **R13.** → r13, for links with an anchor (FTR.HMR.DEV-0002 tech §6a). */
export function requirementAnchor(text: string): string | null {
  const m = /^(R\d+[a-z]?)\./.exec(text.trim());
  return m ? m[1].toLowerCase() : null;
}
