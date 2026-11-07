import { useCallback, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Empty, Graph, Icon, Loading } from "@green-on-grey/ui-kit";
import type { GraphEdge, GraphNode, GraphSelection } from "@green-on-grey/ui-kit";
import { api } from "../api/client";
import { keys } from "../api/queries";
import type { SpecGraphData, SpecGraphEdge, SpecGraphNode, SpecLinkKind } from "../api/types";
import { errorText } from "../lib/errors";

const KINDS: SpecLinkKind[] = ["extends", "changes"];
const GROUPS = 6; // g-c1…g-c6 of the kit

/** What the page shows for the filters of the address (FTR.HMR.DEV-0002 tech §6a): the features of the
 * domain and the system, the features linked to them as context, the edges of the chosen kinds. */
export interface GraphView {
  nodes: GraphNode[];
  edges: GraphEdge[];
  /** The features and their links, for the list under the canvas, in the order of the keys. */
  list: { node: SpecGraphNode; out: SpecGraphEdge[]; in: SpecGraphEdge[] }[];
  byKey: Map<string, SpecGraphNode>;
  /** The legend: a colour group per domain; with more domains than colours a group names several. */
  legend: { group: number; label: string }[];
  groupOf: Map<string, number>;
}

/** The tooltip of a node: its title, phase and links by kind (design §3.6). */
export type NodeTip = (n: SpecGraphNode, links: Record<SpecLinkKind, number>) => string | undefined;

export function graphView(data: SpecGraphData, f: { domain: string; system: string; kinds: SpecLinkKind[] }, tip: NodeTip): GraphView {
  const byKey = new Map(data.nodes.map((n) => [n.key, n]));
  const inside = (n: SpecGraphNode) => (!f.domain || n.domain === f.domain) && (!f.system || n.system === f.system);
  const edges = data.edges.filter((e) => {
    const a = byKey.get(e.source), b = byKey.get(e.target);
    return f.kinds.includes(e.kind) && !!a && !!b && (inside(a) || inside(b));
  });
  const shown = new Map<string, boolean>(); // key → in the filter
  for (const n of data.nodes) if (inside(n)) shown.set(n.key, true);
  for (const e of edges) for (const k of [e.source, e.target]) if (!shown.has(k)) shown.set(k, false);
  const out = new Map<string, SpecGraphEdge[]>(), inc = new Map<string, SpecGraphEdge[]>();
  for (const e of edges) {
    out.set(e.source, [...(out.get(e.source) ?? []), e]);
    inc.set(e.target, [...(inc.get(e.target) ?? []), e]);
  }
  const domains = [...new Set(data.nodes.map((n) => n.domain))].toSorted();
  const groupOf = new Map(domains.map((d, i) => [d, (i % GROUPS) + 1]));
  const legend = Array.from({ length: Math.min(GROUPS, domains.length) }, (_, i) => ({
    group: i + 1, label: domains.filter((_d, j) => j % GROUPS === i).join(", "),
  }));
  const keysSorted = [...shown.keys()].toSorted();
  const nodes: GraphNode[] = keysSorted.map((k) => {
    const n = byKey.get(k)!;
    const mine = [...(out.get(k) ?? []), ...(inc.get(k) ?? [])];
    const links = { extends: mine.filter((e) => e.kind === "extends").length, changes: mine.filter((e) => e.kind === "changes").length };
    return { id: k, label: k, title: tip(n, links), group: groupOf.get(n.domain), size: mine.length, dashed: !n.indexed, muted: !shown.get(k) };
  });
  // design §1: "changes" — a dashed line, "extends" — a solid one; the arrow points at the feature built on or changed
  const gEdges: GraphEdge[] = edges.map((e) => ({ source: e.source, target: e.target, directed: true, dashed: e.kind === "changes",
    title: e.requirements.length > 0 ? e.requirements.join(", ") : undefined }));
  const list = keysSorted.map((k) => ({ node: byKey.get(k)!, out: out.get(k) ?? [], in: inc.get(k) ?? [] }));
  return { nodes, edges: gEdges, list, byKey, legend, groupOf };
}

/** A selection of the graph that is still in the view: a filter may take its node or edge away. */
export function liveSelection(s: GraphSelection, v: Pick<GraphView, "nodes" | "edges">): GraphSelection {
  if (s?.kind === "node") return v.nodes.some((n) => n.id === s.id) ? s : null;
  if (s?.kind === "edge") return v.edges.some((e) => e.source === s.source && e.target === s.target) ? s : null;
  return null;
}

/** The graph of the specification (FTR.HMR.DEV-0002 R15–R17, design §3.6): the whole graph comes in one
 * answer, the filters, the focus and its depth are in the address and work on the client. */
export function SpecGraphPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const domain = params.get("domain") ?? "";
  const system = params.get("system") ?? "";
  const kindParam = params.get("kind");
  const kinds = useMemo(() => (kindParam === null ? KINDS : KINDS.filter((k) => kindParam.split(",").includes(k))), [kindParam]);
  const focus = params.get("focus") ?? undefined;
  const depth: 1 | 2 = params.get("depth") === "2" ? 2 : 1;
  const [selected, setSelected] = useState<GraphSelection>(null);
  const q = useQuery({ queryKey: keys.specGraph, queryFn: () => api.get<SpecGraphData>("/api/v1/spec/graph") });

  const set = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === "") next.delete(k);
      else next.set(k, v);
    }
    setParams(next, { replace: true });
  };
  const toggleKind = (k: SpecLinkKind) => {
    const next = kinds.includes(k) ? kinds.filter((x) => x !== k) : [...kinds, k];
    set({ kind: next.length === KINDS.length ? null : next.join(",") || "none" });
  };

  const data = q.data;
  const tip = useCallback<NodeTip>((n, links) => [n.title, n.phase && t(`phase.${n.phase}`),
    `${t("spec.graph.kind.extends")}: ${links.extends}`, `${t("spec.graph.kind.changes")}: ${links.changes}`].filter(Boolean).join(" · "), [t]);
  const view = useMemo(() => (data ? graphView(data, { domain, system, kinds }, tip) : null), [data, domain, system, kinds, tip]);
  const systems = useMemo(() => [...new Set((data?.nodes ?? []).filter((n) => !domain || n.domain === domain).map((n) => n.system))].toSorted(), [data, domain]);
  const byKey = view?.byKey ?? new Map<string, SpecGraphNode>();
  const focusShown = !!focus && !!view?.nodes.some((n) => n.id === focus);

  const open = (key: string) => {
    if (byKey.get(key)?.indexed) navigate(`/spec/${key}/product`); // R17: a key outside the index opens nothing
  };
  const nodeLabel = (n: GraphNode) => {
    const f = byKey.get(n.id);
    return [n.id, f?.title, f?.indexed ? undefined : t("spec.links.notIndexed")].filter(Boolean).join(", ");
  };

  return (
    <main className="main wide specgraphpage">
      <div className="crumbs">
        <Link to="/spec" aria-label={t("common.back")}><Icon name="back" size={16} /></Link>
        {t("spec.graph.title")}
      </div>
      <div className="graphbar" role="group" aria-label={t("spec.graph.filters")}>
        <select className="inp graphsel" value={domain} aria-label={t("spec.domain")} onChange={(e) => set({ domain: e.target.value, system: null })}>
          <option value="">{t("spec.allDomains")}</option>
          {[...(view?.groupOf.keys() ?? [])].map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
        <select className="inp graphsel" value={system} aria-label={t("spec.graph.system")} onChange={(e) => set({ system: e.target.value })}>
          <option value="">{t("spec.graph.allSystems")}</option>
          {systems.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <div className="seg" role="group" aria-label={t("spec.graph.kinds")}>
          {KINDS.map((k) => (
            <button key={k} type="button" aria-pressed={kinds.includes(k)} onClick={() => toggleKind(k)}>
              <i className={`gkind ${k}`} aria-hidden="true" />{t(`spec.graph.kind.${k}`)}
            </button>
          ))}
        </div>
        {focus && (
          <>
            {!focusShown && <span className="small muted">{t("spec.graph.focusHidden", { key: focus })}</span>}
            {focusShown && <div className="seg" role="group" aria-label={t("spec.graph.depth")}>
              {([1, 2] as const).map((d) => (
                <button key={d} type="button" aria-pressed={depth === d} onClick={() => set({ depth: d === 1 ? null : "2" })}>
                  {t("spec.graph.depthN", { count: d })}
                </button>
              ))}
            </div>}
            <button type="button" className="btn ghost sm" onClick={() => set({ focus: null, depth: null })}>{t("spec.graph.resetFocus")}</button>
          </>
        )}
      </div>
      {q.isLoading ? (
        <Loading />
      ) : q.error || !view ? (
        <Empty icon="alert" title={t("spec.graph.failed")}>
          <div className="small muted">{errorText(t, q.error)}</div>
          <button className="btn sm" onClick={() => void q.refetch()}>{t("spec.changes.retry")}</button>
        </Empty>
      ) : view.edges.length === 0 ? (
        <Empty icon="graph" title={t("spec.graph.empty")}>
          <button className="btn sm" onClick={() => set({ domain: null, system: null, kind: null })}>{t("spec.graph.resetFilters")}</button>
        </Empty>
      ) : (
        <>
          <Graph nodes={view.nodes} edges={view.edges} ariaLabel={t("spec.graph.title")} selected={liveSelection(selected, view)}
            onSelect={(s) => {
              if (s?.kind === "node") { // design §3.6: a click opens the specification; outside the index (dashed) — nothing
                open(s.id);
                return;
              }
              setSelected(s);
            }}
            focus={focus} depth={depth} onOpen={open} nodeLabel={nodeLabel}
            legend={view.legend} />
          <details className="graphlist">
            <summary>{t("spec.graph.list")}</summary>
            <ul>
              {view.list.map(({ node, out, in: inc }) => (
                <li key={node.key}>
                  {node.indexed ? <Link className="mono" to={`/spec/${node.key}/product`}>{node.key}</Link>
                    : <span className="mono muted" title={t("spec.links.notIndexed")}>{node.key}</span>}
                  {node.title && <> {node.title}</>}
                  {out.map((e) => <div key={`o${e.target}${e.kind}`} className="small muted">→ {t(`spec.graph.kind.${e.kind}`)} {e.target}{e.requirements.length > 0 && ` · ${e.requirements.join(", ")}`}</div>)}
                  {inc.map((e) => <div key={`i${e.source}${e.kind}`} className="small muted">← {t(`spec.graph.kind.${e.kind}`)} {e.source}{e.requirements.length > 0 && ` · ${e.requirements.join(", ")}`}</div>)}
                </li>
              ))}
            </ul>
          </details>
        </>
      )}
    </main>
  );
}
