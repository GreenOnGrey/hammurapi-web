import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Icon } from "@green-on-grey/ui-kit";
import { useDraftLinks } from "../../api/queries";
import type { DraftLayer, DraftLinkRef } from "../../api/types";
import { LinkRow } from "../SpecLinks";

/** The links of a feature in work in its header (FTR.HMR.DEV-0003 R6, R7, R9, design §3.4): folded,
 * two groups by layer with the state of its gate; «Changes» goes to the block of changes of its gate. */
export function FeatureLinks({ featureKey }: { featureKey: string }) {
  const { t } = useTranslation();
  const q = useDraftLinks(featureKey);
  const layers = (q.data?.layers ?? []).filter((l) => l.extends.length + l.changes.length > 0);
  if (q.isLoading || layers.length === 0) return null;
  const count = layers.reduce((n, l) => n + l.extends.length + l.changes.length, 0);
  return (
    <div className="speclinksfold featurelinks">
      <Link className="btn ghost sm specgraphbtn specshowgraph" to={`/spec/graph?focus=${encodeURIComponent(featureKey)}&draft=1&layer=both`}>
        <Icon name="graph" size={14} />{t("spec.graph.show")}
      </Link>
      <details className="fold">
        <summary>{t("spec.links.title")} <span className="foldcount">{count}</span></summary>
        {layers.map((l) => <LayerGroup key={l.layer} featureKey={featureKey} layer={l} />)}
      </details>
    </div>
  );
}

function LayerGroup({ featureKey, layer }: { featureKey: string; layer: DraftLayer }) {
  const { t } = useTranslation();
  return (
    <div className="lnklayer">
      <div className="lnklayer-h small">
        {t(`feature.links.layer.${layer.layer}`)}
        <span className={`chip lnkstate ${layer.state}`}>{t(`feature.links.state.${layer.state}`)}</span>
      </div>
      {layer.extends.length > 0 && (
        <LinkRow label={t("spec.links.extends")}>
          {layer.extends.map((r) => <Plate key={r.key} r={r} to={`/spec/${r.key}/${layer.layer}`} withItems={false} />)}
        </LinkRow>
      )}
      {layer.changes.length > 0 && (
        <LinkRow label={t("spec.links.changes")}>
          {layer.changes.map((r) => (
            <Plate key={r.key} r={r} to={`/features/${featureKey}/spec/${layer.layer}#changes-${layer.layer}`} withItems />
          ))}
        </LinkRow>
      )}
    </div>
  );
}

function Plate({ r, to, withItems }: { r: DraftLinkRef; to: string; withItems: boolean }) {
  const { t } = useTranslation();
  const body = (
    <>
      <span className="mono lnk-k">{r.key}</span>
      {withItems && r.items.length > 0 && <span className="mono"> · {r.items.join(", ")}</span>}
      {!withItems && r.title && <span className="lnk-t">{r.title}</span>}
    </>
  );
  if (!r.indexed) return <span className="chip lnkchip lnk-off" title={t("spec.links.notIndexed")}>{body}</span>;
  return <Link className="chip lnkchip" to={to} title={r.title ? `${r.key} ${r.title}` : undefined}>{body}</Link>;
}
