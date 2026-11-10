import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Icon, Markdown } from "@green-on-grey/ui-kit";
import { useSpecChanges, useSpecItem } from "../../api/queries";
import type { SpecChangeItem } from "../../api/types";

const CHIP: Record<SpecChangeItem["state"], string> = { marked: "draft", pending: "handed_off", error: "blocked" };

/** The block "Changes to other features" under the product or arch document (FTR.HMR.DEV-0002 R7,
 * FTR.HMR.DEV-0003 R8, R16, design §3.5): a row per changed requirement or decision with its note
 * and state; a row opens into the text in force in the default branch. No actions — the notes
 * follow the section. */
export function SpecChanges({ featureKey, area = "product" }: { featureKey: string; area?: "product" | "arch" }) {
  const { t } = useTranslation();
  const q = useSpecChanges(featureKey, area);
  const [open, setOpen] = useState<Set<number>>(() => new Set());
  const { hash } = useLocation();
  // FTR.HMR.DEV-0003 design §3.4: a plate «Changes» of the header leads here once the rows are loaded
  const loaded = !!q.data;
  useEffect(() => {
    if (loaded && hash === `#changes-${area}`) document.getElementById(`changes-${area}`)?.scrollIntoView({ block: "start" });
  }, [loaded, hash, area]);
  if (q.isLoading) {
    return (
      <section className="chgblock" aria-busy="true" aria-label={t("spec.changes.title")}>
        <h3 className="sec">{t("spec.changes.title")}</h3>
        {[0, 1, 2].map((i) => <div key={i} className="chgrow chgskel" />)}
      </section>
    );
  }
  if (q.error && !q.data) { // a failed refetch keeps the rows already shown
    return (
      <section className="chgblock" aria-label={t("spec.changes.title")}>
        <h3 className="sec">{t("spec.changes.title")}</h3>
        <div className="chgrow">
          <span className="grow muted">{t("spec.changes.loadFailed")}</span>
          <button className="btn sm" onClick={() => void q.refetch()}>{t("spec.changes.retry")}</button>
        </div>
      </section>
    );
  }
  const items = q.data?.items ?? [];
  if (items.length === 0) return null;
  const toggle = (i: number) => setOpen((s) => {
    const n = new Set(s);
    if (n.has(i)) n.delete(i);
    else n.add(i);
    return n;
  });
  return (
    <section className="chgblock" id={`changes-${area}`} aria-label={t("spec.changes.title")}>
      <h3 className="sec">{t("spec.changes.title")}</h3>
      {items.map((it, i) => {
        const item = it.item !== undefined ? it.item : it.requirement;
        const can = it.state !== "error";
        const shown = can && open.has(i);
        return (
          <div key={`${it.feature} ${item ?? ""} ${i}`} className="chgitem" data-feature={it.feature}>
            <div className="chgrow">
              {can ? (
                <button type="button" className="iconbtn chgchev" aria-expanded={shown} aria-label={t("spec.changes.expand")} onClick={() => toggle(i)}>
                  <Icon name="chevrons" size={14} className={`chgchev-ic${shown ? " open" : ""}`} />
                </button>
              ) : <span className="chgchev" />}
              <Link className="chgref mono" to={it.url}>
                {it.feature} · {item ?? t("spec.changes.whole")}
              </Link>
              <span className={`grow chgnote${can ? " chgclick" : ""}`} onClick={can ? () => toggle(i) : undefined}>
                {it.note}
                {it.error && <span className="chgerr">{t(`spec.changes.reason.${it.error.reason}`, { defaultValue: t("spec.changes.reason.other") })}</span>}
              </span>
              <span className={`st ${CHIP[it.state]} chgst`}>{t(`spec.changes.state.${it.state}`)}</span>
            </div>
            {shown && <ItemNow featureKey={it.feature} item={item ?? "header"} note={it.note} />}
          </div>
        );
      })}
    </section>
  );
}

/** The text in force of a changed item (FTR.HMR.DEV-0003 R8). */
function ItemNow({ featureKey, item, note }: { featureKey: string; item: string; note: string }) {
  const { t } = useTranslation();
  const q = useSpecItem(featureKey, item, true);
  return (
    <div className="chgnow">
      <div className="chgnow-h small">
        <span>{t("spec.changes.now", { key: featureKey, item: item === "header" ? t("spec.changes.whole") : item })}</span>
        {q.data && <Link to={q.data.url}>{t("spec.changes.openInNavigator")}</Link>}
      </div>
      {q.isLoading && <div className="chgrow chgskel" />}
      {q.error && !q.data && (
        <div className="small">
          <span className="muted">{t("spec.changes.textFailed")}</span>{" "}
          <button className="btn ghost sm" onClick={() => void q.refetch()}>{t("spec.changes.retry")}</button>
        </div>
      )}
      {q.data && <div className="chgnow-text"><Markdown text={q.data.markdown} /></div>}
      {note && <div className="small muted">{t("spec.changes.whatChanges", { note })}</div>}
    </div>
  );
}

/** Rows that cannot be applied stop the submission of their gate and the next stage (FTR.HMR.DEV-0002 R3,
 * FTR.HMR.DEV-0003 R12): the rows of product and of arch, each checked only when asked for. */
export function useChangesInvalid(featureKey: string, product: boolean, arch: boolean): { product: boolean; arch: boolean } {
  const p = useSpecChanges(featureKey, "product", product);
  const a = useSpecChanges(featureKey, "arch", arch);
  return {
    product: product && !!p.data?.items.some((it) => it.state === "error"),
    arch: arch && !!a.data?.items.some((it) => it.state === "error"),
  };
}
