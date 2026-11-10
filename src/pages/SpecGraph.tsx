import { useCallback, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Empty, Graph, Icon, Loading } from "@green-on-grey/ui-kit";
import type { GraphEdge, GraphNode, GraphRow, GraphSelection } from "@green-on-grey/ui-kit";
import { api } from "../api/client";
import { keys, useDraftLinks, useFeature } from "../api/queries";
import type { DraftLayer, SpecFeatureLinks, SpecGraphData, SpecGraphEdge, SpecGraphNode, SpecLinkKind, SpecLinkRef } from "../api/types";
import { errorText } from "../lib/errors";
import { LinkRows } from "./SpecLinks";

const KINDS: SpecLinkKind[] = ["extends", "changes"];
const GROUPS = 6; // g-c1…g-c6 of the kit
export type GraphLayout = "rows" | "free";
const LAYOUTS: GraphLayout[] = ["rows", "free"];
export type GraphLayer = "product" | "arch" | "both";
const LAYERS: GraphLayer[] = ["product", "arch", "both"];
const layerOf = (e: SpecGraphEdge) => e.layer ?? "product";

/** The graph with a feature in work (FTR.HMR.DEV-0003 R9): its node and its links from its branch, of the layers
 * shown; the index of the default branch knows nothing of it. The node keeps the place by its key. */
export function withDraft(data: SpecGraphData, key: string, title: string | null, layers: DraftLayer[], layer: GraphLayer): SpecGraphData {
  const [, domain = "", rest = ""] = key.split(".");
  const known = new Set(data.nodes.map((n) => n.key));
  const nodes = data.nodes.filter((n) => n.key !== key);
  nodes.push({ key, title, domain, system: rest.split("-")[0], phase: null, indexed: false, context: false });
  const edges = data.edges.filter((e) => e.source !== key);
  for (const l of layers) {
    if (layer !== "both" && l.layer !== layer) continue;
    for (const kind of KINDS) for (const r of l[kind]) {
      edges.push({ source: key, target: r.key, kind, requirements: r.items, layer: l.layer });
      if (!known.has(r.key)) { // a target outside the default branch: a dashed node, as in the index
        known.add(r.key);
        const [, d = "", s = ""] = r.key.split(".");
        nodes.push({ key: r.key, title: null, domain: d, system: s.split("-")[0], phase: null, indexed: false, context: true });
      }
    }
  }
  return { ...data, nodes, edges };
}

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
  /** The rows of the row layout, by domain, then system; none in the free layout. */
  rows?: GraphRow[];
}

/** The number of a key, FTR.HMR.CMN-0007 → 7: in a system the numbers are given in turn, so they are the order in
 * which the features appeared. */
export const keyNumber = (key: string): number | undefined => {
  const m = /-(\d+)$/.exec(key);
  return m ? Number(m[1]) : undefined; // a key without a number goes to the end of its row
};

/** The tooltip of a node: its title, phase and links by kind (design §3.6). */
export type NodeTip = (n: SpecGraphNode, links: Record<SpecLinkKind, number>) => string | undefined;

export function graphView(data: SpecGraphData, f: { domain: string; system: string; kinds: SpecLinkKind[]; layout: GraphLayout; layer?: GraphLayer; draft?: { key: string; label: string } }, tip: NodeTip): GraphView {
  const byKey = new Map(data.nodes.map((n) => [n.key, n]));
  const inside = (n: SpecGraphNode) => (!f.domain || n.domain === f.domain) && (!f.system || n.system === f.system);
  const layer = f.layer ?? "product";
  const edges = data.edges.filter((e) => {
    const a = byKey.get(e.source), b = byKey.get(e.target);
    return f.kinds.includes(e.kind) && (layer === "both" || layerOf(e) === layer) && !!a && !!b && (inside(a) || inside(b));
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
  const rowed = f.layout === "rows";
  const nodes: GraphNode[] = keysSorted.map((k) => {
    const n = byKey.get(k)!;
    const mine = [...(out.get(k) ?? []), ...(inc.get(k) ?? [])];
    // a link written in both layers is one link of the feature
    const count = (kind: SpecLinkKind) => new Set(mine.filter((e) => e.kind === kind).map((e) => `${e.source}\u0000${e.target}`)).size;
    const links = { extends: count("extends"), changes: count("changes") };
    const node: GraphNode = { id: k, label: k, title: tip(n, links), group: groupOf.get(n.domain), size: links.extends + links.changes, dashed: !n.indexed, muted: !shown.get(k) };
    // R15, design §3.6: a row per domain and system, the features of a row by number; the row names the domain and
    // the system, so a node keeps the rest of its key
    const placed = rowed ? { ...node, row: `${n.domain}.${n.system}`, order: keyNumber(k), label: k.startsWith(`FTR.${n.domain}.`) ? k.slice(`FTR.${n.domain}.`.length) : k } : node;
    // FTR.HMR.DEV-0003 R9: the feature in work — a dashed node signed «in work»
    return f.draft?.key === k ? { ...placed, label: `${placed.label} · ${f.draft.label}` } : placed;
  });
  // design §1: "changes" — a dashed line, "extends" — a solid one; the arrow points at the feature built on or changed;
  // FTR.HMR.DEV-0003 design §1: a link of arch — a double line; the links of a feature in work are dashed (R9)
  const gEdges: GraphEdge[] = edges.map((e) => ({ source: e.source, target: e.target, directed: true,
    dashed: e.kind === "changes" || e.source === f.draft?.key, double: layerOf(e) === "arch",
    title: e.requirements.length > 0 ? e.requirements.join(", ") : undefined }));
  const list = keysSorted.map((k) => ({ node: byKey.get(k)!, out: out.get(k) ?? [], in: inc.get(k) ?? [] }));
  // the keys are sorted, and a key begins with its domain and system: the rows come in their order
  const rows = rowed
    ? [...new Map(keysSorted.map((k) => byKey.get(k)!).map((n) => [`${n.domain}.${n.system}`, { id: `${n.domain}.${n.system}`, label: `${n.domain} · ${n.system}` }])).values()]
    : undefined;
  return { nodes, edges: gEdges, list, byKey, legend, groupOf, rows };
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
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const domain = params.get("domain") ?? "";
  const system = params.get("system") ?? "";
  const kindParam = params.get("kind");
  const kinds = useMemo(() => (kindParam === null ? KINDS : KINDS.filter((k) => kindParam.split(",").includes(k))), [kindParam]);
  const focus = params.get("focus") ?? undefined;
  const depth: 1 | 2 = params.get("depth") === "2" ? 2 : 1;
  const layout: GraphLayout = params.get("layout") === "free" ? "free" : "rows";
  const layerParam = params.get("layer");
  const layer: GraphLayer = layerParam === "arch" || layerParam === "both" ? layerParam : "product";
  // FTR.HMR.DEV-0003 R9: opened from the page of a feature in work, the graph adds it from its branch
  const draftKey = params.get("draft") === "1" && focus ? focus : "";
  const [selected, setSelected] = useState<GraphSelection>(null);
  const [listOpen, setListOpen] = useState(false); // the list is drawn only when it is open
  // both layers in one answer: the switch of the layer filters on the client
  const q = useQuery({ queryKey: keys.specGraph, queryFn: () => api.get<SpecGraphData>("/api/v1/spec/graph?layer=both") });
  const draftLinks = useDraftLinks(draftKey, !!draftKey);
  const draftCard = useFeature(draftKey, !!draftKey);

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

  const draftLayers = draftLinks.data?.layers;
  const draftTitle = draftCard.data?.title ?? null;
  const data = useMemo(() => (q.data && draftKey && draftLayers ? withDraft(q.data, draftKey, draftTitle, draftLayers, layer) : q.data),
    [q.data, draftKey, draftTitle, draftLayers, layer]);
  const inWork = t("spec.graph.inWork");
  const draft = useMemo(() => (draftKey ? { key: draftKey, label: inWork } : undefined), [draftKey, inWork]);
  const tip = useCallback<NodeTip>((n, links) => [n.title, n.phase && t(`phase.${n.phase}`),
    `${t("spec.graph.kind.extends")}: ${links.extends}`, `${t("spec.graph.kind.changes")}: ${links.changes}`].filter(Boolean).join(" · "), [t]);
  const view = useMemo(() => (data ? graphView(data, { domain, system, kinds, layout, layer, draft }, tip) : null), [data, domain, system, kinds, layout, layer, draft, tip]);
  const systems = useMemo(() => [...new Set((data?.nodes ?? []).filter((n) => !domain || n.domain === domain).map((n) => n.system))].toSorted(), [data, domain]);
  const byKey = view?.byKey ?? new Map<string, SpecGraphNode>();
  const focusShown = !!focus && !!view?.nodes.some((n) => n.id === focus);

  const draftPage = `/features/${encodeURIComponent(draftKey)}`;
  const area = layer === "arch" ? "arch" : "product";
  const open = (key: string) => {
    if (draftKey && key === draftKey) navigate(draftPage); // FTR.HMR.DEV-0003 R9: the feature in work opens its page
    else if (byKey.get(key)?.indexed) navigate(`/spec/${key}/${area}`); // R17: a key outside the index opens nothing
  };
  const nodeLabel = (n: GraphNode) => {
    const f = byKey.get(n.id);
    return [n.id, f?.title, n.id === draftKey ? inWork : f?.indexed ? undefined : t("spec.links.notIndexed")].filter(Boolean).join(", ");
  };
  // a link of both layers is one plate with the items of both
  const refs = (edges: SpecGraphEdge[], end: "source" | "target"): SpecLinkRef[] => {
    const by = new Map<string, string[]>();
    for (const e of edges) by.set(e[end], [...new Set([...(by.get(e[end]) ?? []), ...e.requirements])]);
    return [...by].map(([key, requirements]) => {
      const f = byKey.get(key);
      return { key, title: f?.indexed ? f.title : null, indexed: !!f?.indexed, requirements };
    });
  };

  return (
    <main className="main wide specgraphpage">
      <div className="crumbs">
        {/* design §3.6: back to where the graph was opened from; opened by a link from outside — the navigator.
            The filters replace the entry of the address, so one step back leaves the graph. */}
        <Link to={draftKey ? draftPage : "/spec"} aria-label={t("common.back")} onClick={(e) => {
          if (location.key === "default" || draftKey) return; // the first page of the tab, or a feature in work: back to its page
          e.preventDefault();
          navigate(-1);
        }}><Icon name="back" size={16} /></Link>
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
        <div className="seg" role="group" aria-label={t("spec.graph.layer")}>
          {LAYERS.map((l) => (
            <button key={l} type="button" aria-pressed={layer === l} onClick={() => set({ layer: l === "product" ? null : l })}>
              {t(`spec.graph.layers.${l}`)}
            </button>
          ))}
        </div>
        <div className="seg" role="group" aria-label={t("spec.graph.layout")}>
          {LAYOUTS.map((l) => (
            <button key={l} type="button" aria-pressed={layout === l} onClick={() => set({ layout: l === "rows" ? null : l })}>
              {t(`spec.graph.layouts.${l}`)}
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
            {/* the focus of a feature in work is the feature itself: without it there is no feature in work to show */}
            {!draftKey && <button type="button" className="btn ghost sm" onClick={() => set({ focus: null, depth: null })}>{t("spec.graph.resetFocus")}</button>}
          </>
        )}
      </div>
      {draftKey && (
        <div className="graphdraft small" role="status">
          <span>{t("spec.graph.draftBanner", { key: draftKey })}</span>
          {draftLinks.error && <span className="graphdraft-err">{errorText(t, draftLinks.error)}
            <button type="button" className="btn ghost sm" onClick={() => void draftLinks.refetch()}>{t("spec.changes.retry")}</button></span>}
          <Link to={draftPage}>{t("spec.graph.backToFeature")}</Link>
        </div>
      )}
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
          <div className="graphframe">
          <Graph nodes={view.nodes} edges={view.edges} ariaLabel={t("spec.graph.title")} selected={liveSelection(selected, view)}
            onSelect={(s) => {
              if (s?.kind === "node") { // design §3.6: a click opens the specification; outside the index (dashed) — nothing
                open(s.id);
                return;
              }
              setSelected(s);
            }}
            focus={focus} depth={depth} onOpen={open} nodeLabel={nodeLabel}
            legend={view.legend} rows={view.rows} draggable />
          <EdgeLegend layer={layer} kinds={kinds} />
          </div>
          <details className="fold graphlist" onToggle={(e) => setListOpen(e.currentTarget.open)}>
            <summary>{t("spec.graph.list")} <span className="foldcount">{view.list.length}</span></summary>
            {listOpen && (
              <ul>
                {view.list.map(({ node, out, in: inc }) => {
                  const links: SpecFeatureLinks = {
                    extends: refs(out.filter((e) => e.kind === "extends"), "target"),
                    changes: refs(out.filter((e) => e.kind === "changes"), "target"),
                    extendedBy: refs(inc.filter((e) => e.kind === "extends"), "source"),
                    changedBy: refs(inc.filter((e) => e.kind === "changes"), "source"),
                  };
                  return (
                    <li key={node.key} className="graphcard">
                      <div className="graphcard-h">
                        {node.key === draftKey ? <Link className="mono" to={draftPage}>{node.key}</Link>
                          : node.indexed ? <Link className="mono" to={`/spec/${node.key}/${area}`}>{node.key}</Link>
                          : <span className="mono muted" title={t("spec.links.notIndexed")}>{node.key}</span>}
                        {node.title && <span className="graphcard-t">{node.title}</span>}
                        {node.key === draftKey && <span className="chip sm">{inWork}</span>}
                      </div>
                      <LinkRows links={links} area={area} />
                    </li>
                  );
                })}
              </ul>
            )}
          </details>
        </>
      )}
    </main>
  );
}

/** The kinds of edges of the layers shown (FTR.HMR.DEV-0003 design §3.6): four kinds told apart without colour. */
function EdgeLegend({ layer, kinds }: { layer: GraphLayer; kinds: SpecLinkKind[] }) {
  const { t } = useTranslation();
  const layers = layer === "both" ? (["product", "arch"] as const) : [layer];
  if (kinds.length === 0) return null;
  return (
    <div className="graphedges" aria-label={t("spec.graph.edgeLegend")}>
      {layers.flatMap((l) => kinds.map((k) => (
        <span key={`${l}-${k}`}><i className={`gkind ${k}${l === "arch" ? " double" : ""}`} aria-hidden="true" />
          {t(`spec.graph.layers.${l}`)} · {t(`spec.graph.kind.${k}`)}</span>
      )))}
    </div>
  );
}
