import { describe, expect, it } from "vitest";
import { featureStages } from "./Development";
import type { Area, FeatureSummary, Gate, GateStatus } from "../api/types";

const gate = (area: Area, status: GateStatus = "draft") => ({ area, status }) as Gate;
const feature = (over: Partial<FeatureSummary>) => ({ phase: "spec", approvalRequired: true, gates: [], skippedAreas: [], ...over }) as FeatureSummary;
const states = (f: FeatureSummary) => featureStages(f).map((s) => `${s.key}:${s.state}`);
const ALL: Area[] = ["product", "design", "arch", "tech", "qa"];

describe("featureStages", () => {
  it("with approval: the status of each gate, missing gates and next stages wait", () => {
    expect(states(feature({ gates: [gate("product", "approved"), gate("design", "in_review"), gate("arch")] }))).toEqual([
      "product:approved", "design:in_review", "arch:draft", "tech:later", "qa:later", "codegen:later", "validation:later",
    ]);
  });

  it("without approval: a written gate is ready, whatever its status", () => {
    expect(states(feature({ approvalRequired: false, gates: [gate("product"), gate("design")] })).slice(0, 3)).toEqual([
      "product:approved", "design:approved", "arch:later",
    ]);
  });

  it("a skipped area is not on the path", () => {
    expect(states(feature({ gates: [gate("product")], skippedAreas: ["design"] }))).not.toContain("design:later");
  });

  it("a core without skippedAreas: the area waits", () => {
    expect(states(feature({ skippedAreas: undefined }))).toContain("design:later");
  });

  it("after the specification a gate without a row is not on the path", () => {
    expect(states(feature({ phase: "codegen", gates: [gate("product", "approved")] }))).toEqual(["product:approved", "codegen:in_review", "validation:later"]);
  });

  it.each([
    ["codegen", "in_review", "later"],
    ["validation", "approved", "in_review"],
    ["in_release", "approved", "approved"],
    ["released", "approved", "approved"],
    ["rolled_back", "approved", "approved"],
  ] as const)("phase %s: code %s, validation %s", (phase, code, validation) => {
    const out = states(feature({ phase, gates: ALL.map((a) => gate(a, "approved")) }));
    expect(out.slice(-2)).toEqual([`codegen:${code}`, `validation:${validation}`]);
  });
});
