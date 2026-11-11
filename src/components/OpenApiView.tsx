import { useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Markdown } from "@green-on-grey/ui-kit";
import {
  contents, deref, enumValues, expandable, groups, isObj, parseOpenApi, properties, refName, typeLabel,
  type Obj, type Operation,
} from "./openapi";

// FTR.HMR.SPEC-0004 R7, design §3.3, arch A14: an OpenAPI contract drawn by the site itself — the groups by tag, an
// operation unfolds to its parameters, body and responses, the schemas at the end. It is part of the page: no frame
// and no scroll of its own. Every text of the contract is React text or the Markdown of the kit, never markup;
// nothing is requested and there is no «Try it out».

const maxDepth = 6;

/** The view of a contract; the text is JSON or YAML. */
export default function OpenApiView({ text, className }: { text: string; className?: string }) {
  const { t } = useTranslation();
  const parsed = useMemo(() => parseOpenApi(text), [text]);
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  // the page and the full screen may show the same contract at once: a schema is looked for in this view only
  const root = useRef<HTMLDivElement>(null);
  if ("error" in parsed) return <div className="oa-error" role="alert">{t("contract.openapi.invalid", { message: parsed.error })}</div>;
  const doc = parsed.doc;
  const toggle = (id: string, to?: boolean) => setOpen((s) => {
    const n = new Set(s);
    if (to ?? !n.has(id)) n.add(id);
    else n.delete(id);
    return n;
  });
  // a click on the name of a schema opens it in «Schemas» and scrolls to it
  const goSchema = (name: string) => {
    toggle(`schema:${name}`, true);
    window.requestAnimationFrame(() => root.current?.querySelector(`[data-schema="${CSS.escape(name)}"]`)?.scrollIntoView({ block: "start", behavior: "smooth" }));
  };
  return (
    <div ref={root} className={`oa ${className ?? ""}`}>
      <Header doc={doc} />
      {groups(doc).map((g) => (
        <section key={g.tag} className="oa-group">
          <h3 className="oa-tag">{g.tag}{g.description && <span className="oa-tag-desc">{g.description}</span>}</h3>
          {g.operations.map((o) => {
            const id = `${g.tag}|${o.id}`;
            return <OperationRow key={id} doc={doc} o={o} open={open.has(id)} onToggle={() => toggle(id)} goSchema={goSchema} />;
          })}
        </section>
      ))}
      <Schemas doc={doc} open={open} toggle={toggle} goSchema={goSchema} />
    </div>
  );
}

function Header({ doc }: { doc: Obj }) {
  const info = isObj(doc.info) ? doc.info : {};
  const title = typeof info.title === "string" ? info.title : "OpenAPI";
  return (
    <header className="oa-head">
      <div className="oa-title">
        <h2>{title}</h2>
        {typeof info.version === "string" && <span className="chip">{info.version}</span>}
        {typeof doc.openapi === "string" && <span className="chip">OAS {doc.openapi}</span>}
      </div>
      {typeof info.description === "string" && <div className="oa-md"><Markdown text={info.description} /></div>}
    </header>
  );
}

function Caret({ open }: { open: boolean }) {
  return <span className={`oa-caret${open ? " open" : ""}`} aria-hidden="true">▸</span>;
}

function OperationRow({ doc, o, open, onToggle, goSchema }: { doc: Obj; o: Operation; open: boolean; onToggle: () => void; goSchema: (n: string) => void }) {
  const { t } = useTranslation();
  const body = contents(doc, o.op.requestBody);
  const bodyObj = deref(doc, o.op.requestBody);
  const responses = isObj(o.op.responses) ? Object.entries(o.op.responses) : [];
  return (
    <div className={`oa-op oa-${o.method}${open ? " open" : ""}${o.deprecated ? " deprecated" : ""}`}>
      <button type="button" className="oa-op-head" aria-expanded={open} onClick={onToggle}>
        <span className={`oa-method oa-m-${o.method}`}>{o.method.toUpperCase()}</span>
        <span className="oa-path mono">{o.path}</span>
        {o.summary && <span className="oa-summary">{o.summary}</span>}
        <Caret open={open} />
      </button>
      {open && (
        <div className="oa-op-body">
          {o.deprecated && <div className="oa-note">{t("contract.openapi.deprecated")}</div>}
          {o.description && <div className="oa-md"><Markdown text={o.description} /></div>}
          {o.parameters.length > 0 && (
            <Section title={t("contract.openapi.parameters")}>
              <table className="t oa-params">
                <thead><tr><th>{t("contract.openapi.name")}</th><th>{t("contract.openapi.in")}</th><th>{t("contract.openapi.type")}</th><th>{t("contract.openapi.description")}</th></tr></thead>
                <tbody>
                  {o.parameters.map((p, i) => (
                    <tr key={`${String(p.in)}:${String(p.name)}:${i}`}>
                      <td className="mono">{String(p.name ?? "")}{p.required === true && <span className="oa-req" title={t("contract.openapi.required")}>*</span>}</td>
                      <td className="muted">{String(p.in ?? "")}</td>
                      <td><TypeRef doc={doc} s={p.schema} goSchema={goSchema} /></td>
                      <td>{typeof p.description === "string" && <Markdown text={p.description} />}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Section>
          )}
          {body.length > 0 && (
            <Section title={t("contract.openapi.requestBody")} extra={bodyObj?.required === true ? <span className="oa-req-text">{t("contract.openapi.required")}</span> : undefined}>
              {body.map((c) => <Media key={c.type} doc={doc} type={c.type} schema={c.schema} goSchema={goSchema} />)}
            </Section>
          )}
          {responses.length > 0 && (
            <Section title={t("contract.openapi.responses")}>
              {responses.map(([code, r]) => {
                const resp = deref(doc, r);
                return (
                  <div key={code} className="oa-resp">
                    <div className="oa-resp-head">
                      <span className={`oa-code oa-c${code.charAt(0)}`}>{code}</span>
                      {typeof resp?.description === "string" && <span className="oa-resp-desc"><Markdown text={resp.description} /></span>}
                    </div>
                    {contents(doc, r).map((c) => <Media key={c.type} doc={doc} type={c.type} schema={c.schema} goSchema={goSchema} />)}
                  </div>
                );
              })}
            </Section>
          )}
        </div>
      )}
    </div>
  );
}

function Section({ title, extra, children }: { title: string; extra?: ReactNode; children: ReactNode }) {
  return (
    <div className="oa-sec">
      <div className="oa-sec-title">{title}{extra}</div>
      {children}
    </div>
  );
}

function Media({ doc, type, schema, goSchema }: { doc: Obj; type: string; schema: unknown; goSchema: (n: string) => void }) {
  return (
    <div className="oa-media">
      <span className="oa-mime mono">{type}</span>
      {schema !== undefined && <Schema doc={doc} s={schema} goSchema={goSchema} />}
    </div>
  );
}

/** The type of a schema; the name of a referenced schema is a link to it in «Schemas». */
function TypeRef({ doc, s, goSchema }: { doc: Obj; s: unknown; goSchema: (n: string) => void }) {
  const label = typeLabel(s);
  const ref = isObj(s) && typeof s.$ref === "string" ? s.$ref : isObj(s) && isObj(s.items) && typeof s.items.$ref === "string" ? s.items.$ref : undefined;
  const values = enumValues(doc, s);
  const local = ref?.startsWith("#/components/schemas/");
  return (
    <span className="oa-type mono">
      {ref && local ? (
        <button type="button" className="oa-ref" onClick={() => goSchema(refName(ref))}>{label}</button>
      ) : label}
      {values.length > 0 && <span className="oa-enum"> {values.join(" | ")}</span>}
    </span>
  );
}

/** A schema: its type and its properties, each unfolding in place; a cycle stops at the name. */
export function Schema({ doc, s, goSchema, depth = 0, seen = [] }: { doc: Obj; s: unknown; goSchema: (n: string) => void; depth?: number; seen?: string[] }) {
  if (depth > maxDepth) return <TypeRef doc={doc} s={s} goSchema={goSchema} />; // a cycle of YAML aliases stops here
  const props = properties(doc, s);
  const target = deref(doc, s);
  const variants = target && (Array.isArray(target.oneOf) ? target.oneOf : Array.isArray(target.anyOf) ? target.anyOf : null);
  const items = target && target.type === "array" ? target.items : undefined;
  return (
    <div className="oa-schema">
      <TypeRef doc={doc} s={s} goSchema={goSchema} />
      {target && typeof target.description === "string" && depth === 0 && <div className="oa-md small"><Markdown text={target.description} /></div>}
      {props.length > 0 && <Props doc={doc} props={props} goSchema={goSchema} depth={depth} seen={seen} />}
      {variants && variants.map((v, i) => (
        <div key={i} className="oa-variant"><Schema doc={doc} s={v} goSchema={goSchema} depth={depth + 1} seen={seen} /></div>
      ))}
      {items !== undefined && props.length === 0 && expandable(doc, items) && (
        <div className="oa-variant"><Schema doc={doc} s={items} goSchema={goSchema} depth={depth + 1} seen={seen} /></div>
      )}
    </div>
  );
}

function Props({ doc, props, goSchema, depth, seen }: { doc: Obj; props: ReturnType<typeof properties>; goSchema: (n: string) => void; depth: number; seen: string[] }) {
  return (
    <ul className="oa-props">
      {props.map((p) => <Prop key={p.name} doc={doc} p={p} goSchema={goSchema} depth={depth} seen={seen} />)}
    </ul>
  );
}

function Prop({ doc, p, goSchema, depth, seen }: { doc: Obj; p: ReturnType<typeof properties>[number]; goSchema: (n: string) => void; depth: number; seen: string[] }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const target = deref(doc, p.schema);
  const ref = isObj(p.schema) && typeof p.schema.$ref === "string" ? p.schema.$ref : undefined;
  const cycle = ref !== undefined && seen.includes(ref);
  const can = !cycle && depth < maxDepth && expandable(doc, p.schema);
  return (
    <li className="oa-prop">
      <div className="oa-prop-row">
        {can ? (
          <button type="button" className="oa-prop-name mono" aria-expanded={open} onClick={() => setOpen(!open)}>
            <Caret open={open} />{p.name}
          </button>
        ) : <span className="oa-prop-name mono">{p.name}</span>}
        {p.required && <span className="oa-req" title={t("contract.openapi.required")}>*</span>}
        <TypeRef doc={doc} s={p.schema} goSchema={goSchema} />
        {target && typeof target.description === "string" && <span className="oa-prop-desc"><Markdown text={target.description} /></span>}
      </div>
      {open && can && <Schema doc={doc} s={p.schema} goSchema={goSchema} depth={depth + 1} seen={ref ? [...seen, ref] : seen} />}
    </li>
  );
}

function Schemas({ doc, open, toggle, goSchema }: { doc: Obj; open: Set<string>; toggle: (id: string) => void; goSchema: (n: string) => void }) {
  const { t } = useTranslation();
  const schemas = isObj(doc.components) && isObj(doc.components.schemas) ? Object.entries(doc.components.schemas) : [];
  if (schemas.length === 0) return null;
  return (
    <section className="oa-group">
      <h3 className="oa-tag">{t("contract.openapi.schemas")}</h3>
      {schemas.map(([name, s]) => {
        const id = `schema:${name}`;
        const isOpen = open.has(id);
        return (
          <div key={name} data-schema={name} className={`oa-op oa-model${isOpen ? " open" : ""}`}>
            <button type="button" className="oa-op-head" aria-expanded={isOpen} onClick={() => toggle(id)}>
              <span className="oa-path mono">{name}</span>
              <span className="oa-summary">{typeLabel(s)}</span>
              <Caret open={isOpen} />
            </button>
            {isOpen && <div className="oa-op-body"><Schema doc={doc} s={s} goSchema={goSchema} seen={[`#/components/schemas/${name}`]} /></div>}
          </div>
        );
      })}
    </section>
  );
}
