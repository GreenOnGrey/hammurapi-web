import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loading } from "@green-on-grey/ui-kit";
import { ApiError } from "../api/client";
import { Failure, failure, type FileHref, type ViewerFile } from "./FileViewer";

// FTR.HMR.SPEC-0004 R7: the contracts of a service next to tech — OpenAPI drawn by the site (arch A14), proto as
// highlighted text with a table of contents.

// the parser of YAML comes with the view, only for contracts
const OpenApiView = lazy(() => import("./OpenApiView"));

export const MIME_OPENAPI_YAML = "application/vnd.oai.openapi";
export const MIME_OPENAPI_JSON = "application/vnd.oai.openapi+json";
export const MIME_PROTO = "text/x-protobuf";

export function isContract(mimeType: string): boolean {
  return mimeType === MIME_OPENAPI_YAML || mimeType === MIME_OPENAPI_JSON || mimeType === MIME_PROTO;
}

/** «booking · OpenAPI», «booking · proto»: the service of the name and the kind of the contract (design §3.3). */
export function contractLabel(file: Pick<ViewerFile, "name" | "mimeType">): string {
  const service = file.name.replace(/\.(openapi\.(ya?ml|json)|proto)$/, "");
  return `${service} · ${file.mimeType === MIME_PROTO ? "proto" : "OpenAPI"}`;
}

/** The text of a file: the core answers { text } in the mode preview. */
function useContractText(file: ViewerFile, href: FileHref): { text: string | null; error: string | null } {
  const { t } = useTranslation();
  const [state, setState] = useState<{ text: string | null; error: string | null }>({ text: null, error: null });
  const url = href(file.name, "preview");
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(url, { credentials: "include" });
        const body = (await res.json().catch(() => ({}))) as { text?: string; code?: string; message?: string; error?: { code?: string; message?: string } };
        if (!res.ok || typeof body.text !== "string") {
          const code = body.error?.code ?? body.code ?? "";
          throw new ApiError(res.status, code, body.error?.message ?? body.message ?? String(res.status));
        }
        if (!cancelled) setState({ text: body.text, error: null });
      } catch (e) {
        if (!cancelled) setState({ text: null, error: failure(t, e) });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [url, t]);
  return state;
}

/** A contract by its type. */
export function ContractView({ file, href, className }: { file: ViewerFile; href: FileHref; className?: string }) {
  const { text, error } = useContractText(file, href);
  if (error) return <Failure text={error} href={href(file.name)} />;
  if (text === null) return <Loading />;
  return file.mimeType === MIME_PROTO
    ? <ProtoView text={text} className={className} />
    : <Suspense fallback={<Loading />}><OpenApiView text={text} className={className} /></Suspense>;
}

const protoKeywords = new Set(["syntax", "package", "import", "option", "service", "rpc", "returns", "message", "enum", "oneof", "map",
  "repeated", "optional", "reserved", "stream"]);

type Token = { kind: "kw" | "str" | "com" | "num" | "text"; text: string };

/** The tokens of a line of proto: keywords, strings, comments, numbers. */
export function protoTokens(line: string): Token[] {
  const out: Token[] = [];
  const re = /(\/\/.*$)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')|\b(\d+)\b|\b([A-Za-z_]\w*)\b/g;
  let last = 0;
  for (let m = re.exec(line); m; m = re.exec(line)) {
    if (m.index > last) out.push({ kind: "text", text: line.slice(last, m.index) });
    if (m[1]) out.push({ kind: "com", text: m[1] });
    else if (m[2]) out.push({ kind: "str", text: m[2] });
    else if (m[3]) out.push({ kind: "num", text: m[3] });
    else out.push({ kind: protoKeywords.has(m[4]) ? "kw" : "text", text: m[4] });
    last = m.index + m[0].length;
  }
  if (last < line.length) out.push({ kind: "text", text: line.slice(last) });
  return out;
}

/** proto without comments and the contents of strings, the lines kept: braces in them do not count. */
function protoCode(text: string): string {
  let out = "";
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === "/" && text[i + 1] === "/") {
      while (i < text.length && text[i] !== "\n") i++;
      out += "\n";
    } else if (c === "/" && text[i + 1] === "*") {
      const end = text.indexOf("*/", i + 2);
      const comment = text.slice(i, end < 0 ? text.length : end + 2);
      out += comment.replace(/[^\n]/g, " ");
      i += comment.length - 1;
    } else if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < text.length && text[j] !== c && text[j] !== "\n") j += text[j] === "\\" ? 2 : 1;
      out += c + " ".repeat(Math.max(0, Math.min(j, text.length) - i - 1)) + (text[j] === c ? c : "");
      i = text[j] === c ? j : j - 1;
    } else out += c;
  }
  return out;
}

/** The table of contents: service, and message and enum of the top level, with their lines. */
export function protoOutline(text: string): { kind: string; name: string; line: number }[] {
  const out: { kind: string; name: string; line: number }[] = [];
  let depth = 0;
  protoCode(text).split("\n").forEach((code, i) => {
    const m = /^\s*(service|message|enum)\s+([A-Za-z_]\w*)/.exec(code);
    if (m && depth === 0) out.push({ kind: m[1], name: m[2], line: i + 1 });
    for (const c of code) {
      if (c === "{") depth++;
      else if (c === "}") depth = Math.max(0, depth - 1);
    }
  });
  return out;
}

/** proto: highlighted text and the table of contents; a click scrolls to the item (design §3.3). */
export function ProtoView({ text, className }: { text: string; className?: string }) {
  const { t } = useTranslation();
  const lines = useMemo(() => text.split("\n"), [text]);
  const outline = useMemo(() => protoOutline(text), [text]);
  const body = useRef<HTMLDivElement>(null);
  const go = (line: number) => body.current?.querySelector(`[data-line="${line}"]`)?.scrollIntoView({ block: "start", behavior: "smooth" });
  return (
    <div className={`protoview ${className ?? ""}`}>
      <nav className="protoview-toc" aria-label={t("contract.outline")}>
        {outline.map((o) => (
          <button key={`${o.kind}:${o.name}:${o.line}`} type="button" onClick={() => go(o.line)}>
            <span className="protoview-kind">{o.kind}</span> <span className="mono">{o.name}</span>
          </button>
        ))}
      </nav>
      <div className="protoview-code mono" ref={body}>
        {lines.map((l, i) => (
          <div key={i} className="protoview-line" data-line={i + 1}>
            <span className="protoview-n">{i + 1}</span>
            <span>{protoTokens(l).map((tk, j) => tk.kind === "text" ? tk.text : <span key={j} className={`pt-${tk.kind}`}>{tk.text}</span>)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
