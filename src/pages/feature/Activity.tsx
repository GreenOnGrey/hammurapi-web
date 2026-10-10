import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api } from "../../api/client";
import { AREAS, type FeatureCard, type HistoryItem, type List } from "../../api/types";
import { relativeTime, shortSha } from "../../lib/format";
import { Avatar, Loading } from "../../components/ui";

/** History tab: gate events of all areas, newest first. */
export function ActivityTab({ f }: { f: FeatureCard }) {
  const { t, i18n } = useTranslation();
  const areas = AREAS.filter((a) => f.gates.some((g) => g.area === a));
  const hist = useQuery({
    queryKey: ["history", f.uniqueId, "all"],
    queryFn: async () => {
      const lists = await Promise.all(areas.map((a) =>
        api.get<List<HistoryItem>>(`/api/v1/features/${f.uniqueId}/gates/${a}/history?limit=100`).then((l) => l.items.map((h) => ({ ...h, area: a })))));
      return lists.flat().toSorted((x, y) => y.createdAt.localeCompare(x.createdAt));
    },
  });
  if (hist.isLoading) return <Loading />;
  return (
    <div className="hist">
      {hist.data?.length === 0 && <p className="muted">{t("history.empty")}</p>}
      {hist.data?.map((h) => (
        <div className="h" key={h.id}>
          <Avatar small agent={h.isAgent} name={h.isAgent ? "A" : h.actor ?? "?"} />
          <div>
            <b>{t(`areas.${h.area}`)}</b> · {h.isAgent ? t("history.byAgent", { name: h.actor ?? "" }) : h.actor ?? t("history.unknown")}: {t(`history.events.${h.type}`)}
            <div className="muted">{relativeTime(h.createdAt, i18n.language)}</div>
          </div>
          {h.commit && h.commitUrl ? <a className="sha" href={h.commitUrl} target="_blank" rel="noreferrer">{shortSha(h.commit)}</a> : <span />}
        </div>
      ))}
    </div>
  );
}
