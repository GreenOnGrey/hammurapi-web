import { useTranslation } from "react-i18next";
import type { Area, GateStatus } from "../api/types";

// The shared components — Modal, toasts, Avatar, Switch, Empty, Loading — come
// from @green-on-grey/ui-kit (FTR.NAB.CMN-0005); here is what only Hammurapi has.

/** Gate status badge; in a domain without approval the neutral "no approval" status is shown. */
export function StatusBadge({ status, approvalRequired = true }: { status: GateStatus; approvalRequired?: boolean }) {
  const { t } = useTranslation();
  if (!approvalRequired) return <span className="st none">{t("status.none")}</span>;
  return <span className={`st ${status}`}>{t(`status.${status}`)}</span>;
}

export function AreaName({ area }: { area: Area | string }) {
  const { t } = useTranslation();
  return <>{t(`areas.${area}`)}</>;
}
