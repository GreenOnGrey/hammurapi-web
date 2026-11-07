import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useSpecChanges } from "../../api/queries";
import type { SpecChangeItem } from "../../api/types";

const CHIP: Record<SpecChangeItem["state"], string> = { marked: "draft", pending: "handed_off", error: "blocked" };

/** The block "Changes to other features" under the product document (FTR.HMR.DEV-0002 R7, design §3.1):
 * a row per changed requirement with its note and state; no actions — the notes follow the section. */
export function SpecChanges({ featureKey }: { featureKey: string }) {
  const { t } = useTranslation();
  const q = useSpecChanges(featureKey);
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
  return (
    <section className="chgblock" aria-label={t("spec.changes.title")}>
      <h3 className="sec">{t("spec.changes.title")}</h3>
      {items.map((it, i) => (
        <div key={`${it.feature} ${it.requirement ?? ""} ${i}`} className="chgrow">
          <Link className="chgref mono" to={it.url}>
            {it.feature} · {it.requirement ?? t("spec.changes.whole")}
          </Link>
          <span className="grow chgnote">
            {it.note}
            {it.error && <span className="chgerr">{t(`spec.changes.reason.${it.error.reason}`, { defaultValue: t("spec.changes.reason.other") })}</span>}
          </span>
          <span className={`st ${CHIP[it.state]} chgst`}>{t(`spec.changes.state.${it.state}`)}</span>
        </div>
      ))}
    </section>
  );
}

/** Rows that cannot be applied stop the submission (FTR.HMR.DEV-0002 R3): the reason for the button. */
export function useChangesInvalid(featureKey: string, enabled: boolean): boolean {
  const q = useSpecChanges(featureKey, enabled);
  return enabled && !!q.data?.items.some((it) => it.state === "error");
}
