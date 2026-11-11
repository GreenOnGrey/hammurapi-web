import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { contractLabel, isContract, protoOutline, protoTokens } from "./ContractView";
import OpenApiView, { Schema } from "./OpenApiView";
import { expandable, groups, parseOpenApi, properties, resolveRef, typeLabel } from "./openapi";
import { errorLine, errorMessage } from "../editor/mermaid";

// FTR.HMR.SPEC-0004 R7
const booking = `openapi: 3.0.3
info:
  title: booking
  version: 1.0.0
  description: "<img src=x onerror=alert(1)>"
tags:
  - name: booking
paths:
  /bookings/{id}:
    parameters:
      - { name: id, in: path, required: true, schema: { type: string } }
      - { name: full, in: query, schema: { type: boolean } }
    get:
      tags: [booking]
      responses:
        "200": { description: ok, content: { application/json: { schema: { $ref: "#/components/schemas/Booking" } } } }
  /bookings/{id}/return:
    post:
      tags: [booking]
      responses: { "204": { description: returned } }
  /health:
    get:
      responses: { "200": { description: ok } }
components:
  schemas:
    Booking:
      type: object
      required: [id]
      allOf: [{ $ref: "#/components/schemas/Node" }]
      properties:
        id: { type: string }
        car: { type: string }
    Node:
      type: object
      properties:
        next: { $ref: "#/components/schemas/Node" }
`;

describe("contracts", () => {
  it("VIEW-03: OpenAPI is drawn by the site: no frame, the texts of the contract are text, no «Try it out»", () => {
    const html = renderToStaticMarkup(<OpenApiView text={booking} />);
    expect(html).not.toContain("<iframe");
    expect(html).not.toContain("<script");
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(html).toContain("/bookings/{id}");
    expect(html).not.toMatch(/try it out/i);
  });

  it("VIEW-01: the operations are grouped by tag, the schemas follow local references, a cycle stops", () => {
    const parsed = parseOpenApi(booking);
    if ("error" in parsed) throw new Error(parsed.error);
    const doc = parsed.doc;
    expect(groups(doc).map((g) => [g.tag, g.operations.map((o) => o.id)])).toEqual([
      ["booking", ["get /bookings/{id}", "post /bookings/{id}/return"]],
      ["default", ["get /health"]],
    ]);
    const get = groups(doc)[0].operations[0];
    expect(get.parameters.map((p) => `${String(p.in)}:${String(p.name)}`)).toEqual(["path:id", "query:full"]);
    expect(typeLabel({ type: "array", items: { $ref: "#/components/schemas/Booking" } })).toBe("array<Booking>");
    expect(typeLabel({ type: ["string", "null"], format: "date-time" })).toBe("string (date-time) | null");
    expect(properties(doc, { $ref: "#/components/schemas/Booking" }).map((p) => `${p.name}${p.required ? "*" : ""}`)).toEqual(["next", "id*", "car"]) // the parts of allOf first;
    expect(properties(doc, { $ref: "#/components/schemas/Node" })).toHaveLength(1); // Node.next is Node: no endless list
    expect(resolveRef(doc, "https://example.com/x.yaml#/A")).toBeUndefined();
    expect(parseOpenApi("openapi: [")).toHaveProperty("error");
    expect(resolveRef(doc, "#/components/schemas/%E0")).toBeUndefined(); // a malformed escape does not throw
  });

  it("VIEW-01: cycles of $ref and of YAML aliases stop", () => {
    const text = `openapi: 3.0.3
info: { title: t, version: "1" }
paths:
  /x:
    get:
      responses:
        "200": { description: ok, content: { application/json: { schema: { $ref: "#/components/schemas/List" } } } }
components:
  schemas:
    List: { type: array, items: { $ref: "#/components/schemas/List" } }
    Loop: &loop { type: array, items: *loop, allOf: [*loop], oneOf: [*loop] }
`;
    const parsed = parseOpenApi(text);
    if ("error" in parsed) throw new Error(parsed.error);
    const loop = (parsed.doc.components as { schemas: { Loop: unknown } }).schemas.Loop;
    expect(typeLabel(loop)).toContain("…");
    expect(properties(parsed.doc, loop)).toEqual([]);
    expect(expandable(parsed.doc, { $ref: "#/components/schemas/List" })).toBe(false);
    const html = renderToStaticMarkup(<OpenApiView text={text} />);
    expect(html).toContain("List");
    expect(renderToStaticMarkup(<Schema doc={parsed.doc} s={loop} goSchema={() => {}} />)).toContain("oa-variant");
  });

  it("labels and types of contracts", () => {
    expect(contractLabel({ name: "booking.openapi.yaml", mimeType: "application/vnd.oai.openapi" })).toBe("booking · OpenAPI");
    expect(contractLabel({ name: "pricing-api.proto", mimeType: "text/x-protobuf" })).toBe("pricing-api · proto");
    expect(isContract("application/vnd.oai.openapi+json")).toBe(true);
    expect(isContract("text/html")).toBe(false);
  });

  it("VIEW-02: proto is highlighted and its top-level service and messages are the outline", () => {
    const src = 'syntax = "proto3";\n// service Hidden {\nservice Booking {\n  rpc Cancel(Req) returns (Resp);\n}\nmessage Req {\n  message Inner {}\n  string id = 1;\n}\nenum State { OK = 0; }\n';
    expect(protoOutline(src)).toEqual([
      { kind: "service", name: "Booking", line: 3 },
      { kind: "message", name: "Req", line: 6 },
      { kind: "enum", name: "State", line: 10 },
    ]);
    // braces in block comments and in strings of either quote do not count; a // in a string is not a comment
    const tricky = '/* message Hidden { */\noption x = \'{\';\noption y = "http://a{";\nservice Booking {\n}\nmessage Req {}\n';
    expect(protoOutline(tricky).map((o) => o.name)).toEqual(["Booking", "Req"]);
    const kinds = protoTokens('  repeated string ids = 2; // the ids').map((t) => `${t.kind}:${t.text.trim()}`).filter((x) => !x.endsWith(":"));
    expect(kinds).toEqual(["kw:repeated", "text:string", "text:ids", "text:=", "num:2", "text:;", "com:// the ids"]);
  });

  it("the line of an error of mermaid", () => {
    expect(errorLine("Parse error on line 4:\n...")).toBe(4);
    expect(errorLine("No diagram type detected")).toBeUndefined();
    expect(errorMessage("Parse error on line 6:\n...lient, bookng\n----^\nExpecting 'ATTRIBUTE', got 'EOF'")).toBe("Expecting 'ATTRIBUTE', got 'EOF'");
    expect(errorMessage("No diagram type detected matching given configuration")).toBe("No diagram type detected matching given configuration");
  });
});
