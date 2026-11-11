import { parse } from "yaml";

// FTR.HMR.SPEC-0004 R7, design §3.3: the model of an OpenAPI 3 contract for its view on the site. The contract is
// data of a repository: it is read as JSON or YAML, never run, and only local references (#/…) are followed.

export type Obj = Record<string, unknown>;

export const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined);

/** The contract parsed: JSON first, then YAML (aliases are limited by the parser). */
export function parseOpenApi(text: string): { doc: Obj } | { error: string } {
  let doc: unknown;
  try {
    doc = JSON.parse(text);
  } catch {
    try {
      doc = parse(text, { maxAliasCount: 100 });
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) };
    }
  }
  return isObj(doc) ? { doc } : { error: "not an object" };
}

/** A local reference «#/components/schemas/Booking»; anything else stays unresolved. */
export function resolveRef(doc: Obj, ref: string): unknown {
  if (!ref.startsWith("#/")) return undefined;
  let cur: unknown = doc;
  for (const raw of ref.slice(2).split("/")) {
    let key: string;
    try {
      key = decodeURIComponent(raw).replace(/~1/g, "/").replace(/~0/g, "~");
    } catch {
      return undefined; // a malformed escape names nothing
    }
    if (!isObj(cur) || !Object.hasOwn(cur, key)) return undefined;
    cur = cur[key];
  }
  return cur;
}

/** The last segment of a reference: the name of the schema. */
export const refName = (ref: string) => ref.slice(ref.lastIndexOf("/") + 1);

/** How deep the walks of a schema go: YAML aliases can make a real cycle of objects, and $ref can chain. */
const walkLimit = 8;

/** The object itself or the one its $ref names (one step; the view follows chains itself). */
export function deref(doc: Obj, v: unknown): Obj | undefined {
  if (!isObj(v)) return undefined;
  const ref = str(v.$ref);
  if (ref === undefined) return v;
  const r = resolveRef(doc, ref);
  return isObj(r) ? r : undefined;
}

export const methods = ["get", "put", "post", "delete", "options", "head", "patch", "trace"] as const;
export type Method = (typeof methods)[number];

export interface Operation {
  id: string;
  method: Method;
  path: string;
  summary?: string;
  description?: string;
  deprecated: boolean;
  op: Obj;
  parameters: Obj[];
}

export interface Group {
  tag: string;
  description?: string;
  operations: Operation[];
}

/** The operations grouped by tag: the tags of the document first, in its order, then the others as met; an
 * operation without tags goes to «default». An operation with several tags is in each of its groups. */
export function groups(doc: Obj): Group[] {
  const out = new Map<string, Group>();
  const tags = Array.isArray(doc.tags) ? doc.tags : [];
  for (const t of tags) {
    const name = isObj(t) ? str(t.name) : undefined;
    if (name && !out.has(name)) out.set(name, { tag: name, description: str((t as Obj).description), operations: [] });
  }
  const paths = isObj(doc.paths) ? doc.paths : {};
  for (const [path, rawItem] of Object.entries(paths)) {
    const item = deref(doc, rawItem);
    if (!item) continue;
    const shared = Array.isArray(item.parameters) ? item.parameters : [];
    for (const method of methods) {
      const op = deref(doc, item[method]);
      if (!op) continue;
      // a parameter of the operation replaces the one of the path with the same name and place
      const own = (Array.isArray(op.parameters) ? op.parameters : []).map((p) => deref(doc, p)).filter(isObj);
      const key = (p: Obj) => `${str(p.in)}:${str(p.name)}`;
      const ownKeys = new Set(own.map(key));
      const parameters = [...shared.map((p) => deref(doc, p)).filter(isObj).filter((p) => !ownKeys.has(key(p))), ...own];
      const operation: Operation = {
        id: `${method} ${path}`, method, path, op, parameters,
        summary: str(op.summary), description: str(op.description), deprecated: op.deprecated === true,
      };
      const opTags = (Array.isArray(op.tags) ? op.tags : []).filter((t): t is string => typeof t === "string");
      for (const tag of opTags.length ? opTags : ["default"]) {
        if (!out.has(tag)) out.set(tag, { tag, operations: [] });
        out.get(tag)!.operations.push(operation);
      }
    }
  }
  return [...out.values()].filter((g) => g.operations.length > 0);
}

/** The short type of a schema: «string (date-time)», «array<Booking>», «Booking», «oneOf», «integer | null». */
export function typeLabel(s: unknown, depth = 0): string {
  if (!isObj(s)) return "any";
  if (depth > walkLimit) return "…";
  const ref = str(s.$ref);
  if (ref !== undefined) return refName(ref);
  for (const k of ["oneOf", "anyOf", "allOf"] as const) {
    if (Array.isArray(s[k])) return s[k].map((x) => typeLabel(x, depth + 1)).join(k === "allOf" ? " & " : " | ");
  }
  const types = Array.isArray(s.type) ? s.type.filter((t): t is string => typeof t === "string") : str(s.type) ? [s.type as string] : [];
  let base = types.filter((t) => t !== "null").join(" | ") || (isObj(s.properties) ? "object" : "any");
  if (base === "array") base = `array<${typeLabel(s.items, depth + 1)}>`;
  const format = str(s.format);
  if (format) base += ` (${format})`;
  if (types.includes("null") || s.nullable === true) base += " | null";
  return base;
}

export interface Property {
  name: string;
  schema: unknown;
  required: boolean;
}

/** The properties of an object schema; allOf parts are merged in, a $ref part is followed. */
export function properties(doc: Obj, s: unknown, seen = new Set<unknown>()): Property[] {
  // the walk stops at an object already met: a $ref chain or a cycle of YAML aliases
  if (!isObj(s) || seen.has(s) || seen.size > walkLimit * 4) return [];
  const next = new Set(seen).add(s);
  const ref = str(s.$ref);
  if (ref !== undefined) return properties(doc, resolveRef(doc, ref), next);
  const out: Property[] = [];
  if (Array.isArray(s.allOf)) for (const part of s.allOf) out.push(...properties(doc, part, next));
  const required = new Set(Array.isArray(s.required) ? s.required.filter((r): r is string => typeof r === "string") : []);
  if (isObj(s.properties)) {
    for (const [name, schema] of Object.entries(s.properties)) out.push({ name, schema, required: required.has(name) });
  }
  return out;
}

/** The schema has something to unfold: properties, items with properties, variants. */
export function expandable(doc: Obj, s: unknown, depth = 0): boolean {
  if (!isObj(s) || depth > walkLimit) return false;
  const target = deref(doc, s);
  if (!target) return false;
  if (properties(doc, s).length > 0) return true;
  if (Array.isArray(target.oneOf) || Array.isArray(target.anyOf)) return true;
  if (str(target.type) === "array") return expandable(doc, target.items, depth + 1);
  return false;
}

/** The values of an enum, as text. */
export function enumValues(doc: Obj, s: unknown): string[] {
  const t = deref(doc, s);
  return t && Array.isArray(t.enum) ? t.enum.map((v) => (typeof v === "string" ? v : JSON.stringify(v))) : [];
}

/** The content of a body or a response: its media types with their schemas. */
export function contents(doc: Obj, v: unknown): { type: string; schema: unknown }[] {
  const body = deref(doc, v);
  if (!body || !isObj(body.content)) return [];
  return Object.entries(body.content).map(([type, m]) => ({ type, schema: isObj(m) ? m.schema : undefined }));
}
