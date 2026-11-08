import { describe, expect, it } from "vitest";
import type { SpecGraphData } from "../api/types";
import { graphView, keyNumber, liveSelection } from "./SpecGraph";

const node = (key: string, indexed = true) => {
  const [, domain, rest] = key.split(".");
  return { key, title: indexed ? key : null, domain, system: rest.split("-")[0], phase: indexed ? ("released" as const) : null, indexed, context: false };
};
const data: SpecGraphData = {
  commit: "c",
  nodes: [node("FTR.HMR.CMN-0001"), node("FTR.HMR.DEV-0002"), node("FTR.NAB.CMN-0005"), node("FTR.NAB.CMN-0003"), node("FTR.NAB.CMN-0009", false)],
  edges: [
    { source: "FTR.HMR.DEV-0002", target: "FTR.HMR.CMN-0001", kind: "changes", requirements: ["R13"] },
    { source: "FTR.HMR.DEV-0002", target: "FTR.NAB.CMN-0005", kind: "extends", requirements: [] },
    { source: "FTR.NAB.CMN-0005", target: "FTR.NAB.CMN-0003", kind: "changes", requirements: ["R19"] },
    { source: "FTR.NAB.CMN-0005", target: "FTR.NAB.CMN-0009", kind: "extends", requirements: [] },
  ],
};
const all = { domain: "", system: "", kinds: ["extends", "changes"] as ("extends" | "changes")[], layout: "rows" as const };
const tip = () => undefined;

// FTR.HMR.DEV-0002 qa §6c: the filters of the graph on the client.
describe("the view of the graph", () => {
  it("GRAPH-01: the domain and the features linked to it as context", () => {
    const v = graphView(data, { ...all, domain: "HMR" }, tip);
    expect(v.nodes.map((n) => [n.id, !!n.muted])).toEqual([["FTR.HMR.CMN-0001", false], ["FTR.HMR.DEV-0002", false], ["FTR.NAB.CMN-0005", true]]);
    expect(v.edges).toHaveLength(2); // the edges between two features outside the filter are not shown
  });
  it("GRAPH-02: one kind of links, dashed for changes", () => {
    const v = graphView(data, { ...all, kinds: ["changes"] }, tip);
    expect(v.edges.every((e) => e.dashed)).toBe(true);
    expect(v.edges.map((e) => e.title)).toEqual(["R13", "R19"]);
  });
  it("GRAPH-06: no kinds, no edges", () => {
    expect(graphView(data, { ...all, kinds: [] }, tip).edges).toHaveLength(0);
  });
  it("GRAPH-07: a key outside the index is a dashed node", () => {
    const v = graphView(data, all, tip);
    expect(v.nodes.find((n) => n.id === "FTR.NAB.CMN-0009")?.dashed).toBe(true);
    expect(v.nodes.find((n) => n.id === "FTR.HMR.DEV-0002")?.size).toBe(2);
  });
  it("a colour group per domain; the legend joins the domains of one group", () => {
    const many = { ...data, nodes: ["AAA", "BBB", "CCC", "DDD", "EEE", "FFF", "GGG"].map((d) => node(`FTR.${d}.SYS-0001`)), edges: [] };
    const v = graphView(many, all, tip);
    expect(v.legend).toHaveLength(6);
    expect(v.legend[0].label).toBe("AAA, GGG");
    expect(v.groupOf.get("GGG")).toBe(1);
  });
  it("a selection taken away by a filter is dropped", () => {
    const v = graphView(data, { ...all, kinds: ["extends"] }, tip);
    expect(liveSelection({ kind: "edge", source: "FTR.HMR.DEV-0002", target: "FTR.HMR.CMN-0001" }, v)).toBeNull();
    expect(liveSelection({ kind: "edge", source: "FTR.HMR.DEV-0002", target: "FTR.NAB.CMN-0005" }, v)).not.toBeNull();
  });
  it("GRAPH-11: by default a row per domain and system, its features by number, the key without the domain", () => {
    const v = graphView(data, all, tip);
    expect(v.rows?.map((r) => r.label)).toEqual(["HMR · CMN", "HMR · DEV", "NAB · CMN"]);
    const at = new Map(v.nodes.map((n) => [n.id, n]));
    expect(at.get("FTR.NAB.CMN-0009")).toMatchObject({ row: "NAB.CMN", order: 9, label: "CMN-0009" });
    expect(at.get("FTR.HMR.DEV-0002")).toMatchObject({ row: "HMR.DEV", order: 2, label: "DEV-0002" });
  });
  it("GRAPH-11: the free layout has no rows and labels by the whole key", () => {
    const v = graphView(data, { ...all, layout: "free" }, tip);
    expect(v.rows).toBeUndefined();
    expect(v.nodes.every((n) => n.row === undefined && n.label === n.id)).toBe(true);
  });
  it("the number of a key is the order of its feature in the system", () => {
    expect(keyNumber("FTR.HMR.CMN-0007")).toBe(7);
    expect(keyNumber("FTR.HMR.CMN-0010")!).toBeGreaterThan(keyNumber("FTR.HMR.CMN-0009")!);
    expect(keyNumber("FTR.HMR.CMN-OLD")).toBeUndefined();
  });
});
