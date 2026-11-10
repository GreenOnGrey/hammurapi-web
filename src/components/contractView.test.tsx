import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { contractLabel, isContract, OpenApiFrame, protoOutline, protoTokens } from "./ContractView";
import { errorLine, errorMessage } from "../editor/mermaid";

// FTR.HMR.SPEC-0004 R7
describe("contracts", () => {
  it("VIEW-03: the frame of OpenAPI runs scripts in an opaque origin and gets the text by a message", () => {
    const html = renderToStaticMarkup(<OpenApiFrame text="openapi: 3.0.3" theme="dark" title="booking.openapi.yaml" />);
    expect(html).toContain('sandbox="allow-scripts"');
    expect(html).not.toContain("allow-same-origin");
    expect(html).toContain('src="/viewers/openapi.html"');
    expect(html).not.toContain("openapi: 3.0.3"); // the text is posted, never put into the page
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
