import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  Link,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api, qs } from "../api/client";
import { apiUrl } from "../api/base";
import { keys } from "../api/queries";
import type {
  SpecArea,
  SpecDocument,
  SpecFile,
  SpecSearchResult,
  SpecTree,
  SpecTreeFeature,
} from "../api/types";
import { SPEC_AREAS } from "../api/types";
import { MarkdownEditor } from "../editor/MarkdownEditor";
import { Icon } from "../components/Icon";
import { Empty, Loading, Modal, useToast } from "../components/ui";
import { PhaseBadge } from "../components/cycle";
import { bytes, dateTime } from "../lib/format";
import { errorText } from "../lib/errors";

/** "Specification": the navigator of the specification merged to the default
 * branch, read-only (FTR.HMR.CMN-0005 R11–R16, R20). */
export function SpecPage() {
  const { t } = useTranslation();
  const { featureKey, area } = useParams();
  const [params, setParams] = useSearchParams();
  const q = params.get("q") ?? "";
  const tree = useQuery({
    queryKey: keys.specTree,
    queryFn: () => api.get<SpecTree>("/api/v1/spec/tree"),
  });
  const [showTree, setShowTree] = useState(!featureKey);

  const search = (v: string) => {
    const next = new URLSearchParams(params);
    if (v.trim()) next.set("q", v.trim());
    else next.delete("q");
    setParams(next, { replace: true });
  };

  return (
    <main className="main wide specpage">
      <SearchBar key={q} initial={q} onSearch={search} />
      <div className={`specnav${showTree ? " tree-open" : ""}`}>
        <aside className="spectree" aria-label={t("spec.tree")}>
          {tree.isLoading && <Loading />}
          {tree.data && (
            <TreeView
              tree={tree.data}
              current={featureKey}
              area={area as SpecArea | undefined}
              onOpen={() => setShowTree(false)}
            />
          )}
        </aside>
        <section className="specbody">
          <button
            className="btn ghost sm show-m"
            onClick={() => setShowTree(true)}
          >
            <Icon name="back" size={14} />
            {t("spec.tree")}
          </button>
          {q ? (
            <SearchResults q={q} />
          ) : featureKey && area ? (
            <DocumentView featureKey={featureKey} area={area as SpecArea} />
          ) : tree.data && tree.data.domains.length === 0 ? (
            <Empty icon="book" title={t("spec.empty")}>
              {t("spec.emptyHint")}
            </Empty>
          ) : (
            <Empty icon="book" title={t("spec.choose")}>
              {t("spec.chooseHint")}
            </Empty>
          )}
        </section>
      </div>
    </main>
  );
}

function SearchBar({
  initial,
  onSearch,
}: {
  initial: string;
  onSearch: (q: string) => void;
}) {
  const { t } = useTranslation();
  const [v, setV] = useState(initial); // remounted by key when the query changes
  return (
    <form
      className="specsearch"
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        onSearch(v);
      }}
    >
      <Icon name="search" />
      <input
        value={v}
        onChange={(e) => setV(e.target.value)}
        placeholder={t("spec.searchPlaceholder")}
        aria-label={t("spec.search")}
      />
      {initial && (
        <button
          type="button"
          className="iconbtn"
          aria-label={t("common.close")}
          onClick={() => onSearch("")}
        >
          <Icon name="x" size={14} />
        </button>
      )}
    </form>
  );
}

// ─── tree (R12) ─────────────────────────────────────────────────────

function TreeView({
  tree,
  current,
  area,
  onOpen,
}: {
  tree: SpecTree;
  current?: string;
  area?: SpecArea;
  onOpen: () => void;
}) {
  const { t } = useTranslation();
  // Open path: the domain and system of the current document, and the feature itself.
  const [open, setOpen] = useState<Record<string, boolean>>(() => {
    const o: Record<string, boolean> = {};
    if (current) {
      const [, d, rest] = current.split(".");
      const s = rest?.split("-")[0];
      if (d) o[`d:${d}`] = true;
      if (d && s) o[`s:${d}/${s}`] = true;
      o[`f:${current}`] = true;
    }
    return o;
  });
  const toggle = (k: string) => setOpen((o) => ({ ...o, [k]: !o[k] }));
  if (tree.domains.length === 0)
    return (
      <div className="small muted" style={{ padding: 12 }}>
        {t("spec.empty")}
      </div>
    );
  return (
    <ul className="tree" role="tree">
      {tree.domains.map((d) => (
        <li key={d.key} role="treeitem" aria-expanded={!!open[`d:${d.key}`]}>
          <button className="node dom" onClick={() => toggle(`d:${d.key}`)}>
            <Chevron open={!!open[`d:${d.key}`]} />
            <Icon name="grid" size={14} />
            <b>{d.key}</b> <span className="muted">{d.name}</span>
          </button>
          {open[`d:${d.key}`] && (
            <ul role="group">
              {d.systems.map((s) => (
                <li
                  key={s.key}
                  role="treeitem"
                  aria-expanded={!!open[`s:${d.key}/${s.key}`]}
                >
                  <button
                    className="node"
                    onClick={() => toggle(`s:${d.key}/${s.key}`)}
                  >
                    <Chevron open={!!open[`s:${d.key}/${s.key}`]} />
                    <b>{s.key}</b> <span className="muted">{s.name}</span>
                    <span className="count">{s.count}</span>
                  </button>
                  {open[`s:${d.key}/${s.key}`] && (
                    <ul role="group">
                      {s.features.map((f) => (
                        <FeatureNode
                          key={f.key}
                          f={f}
                          open={open}
                          toggle={toggle}
                          current={current}
                          area={area}
                          onOpen={onOpen}
                        />
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ul>
  );
}

function FeatureNode({
  f,
  open,
  toggle,
  current,
  area,
  onOpen,
}: {
  f: SpecTreeFeature;
  open: Record<string, boolean>;
  toggle: (k: string) => void;
  current?: string;
  area?: SpecArea;
  onOpen: () => void;
}) {
  const { t } = useTranslation();
  const k = `f:${f.key}`;
  return (
    <li role="treeitem" aria-expanded={!!open[k]}>
      <button className="node feat" onClick={() => toggle(k)} title={f.title}>
        <Chevron open={!!open[k]} />
        <span className="mono small">{f.key}</span>{" "}
        <span className="ellipsis">{f.title}</span>
      </button>
      {open[k] && (
        <ul role="group">
          {f.areas.map((a) => (
            <li key={a} role="treeitem">
              <Link
                className={`node doc${current === f.key && area === a ? " on" : ""}`}
                to={`/spec/${f.key}/${a}`}
                onClick={onOpen}
              >
                <Icon name="files" size={13} />
                {t(`areas.${a}`)}
              </Link>
            </li>
          ))}
          {f.fixes.map((x) => (
            <FeatureNode
              key={x.key}
              f={x}
              open={open}
              toggle={toggle}
              current={current}
              area={area}
              onOpen={onOpen}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <span className={`chev${open ? " open" : ""}`} aria-hidden>
      ›
    </span>
  );
}

// ─── document (R13, R15, R20) ───────────────────────────────────────

function DocumentView({
  featureKey,
  area,
}: {
  featureKey: string;
  area: SpecArea;
}) {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const location = useLocation();
  const doc = useQuery({
    queryKey: keys.specDoc(featureKey, area),
    queryFn: () =>
      api.get<SpecDocument>(
        `/api/v1/spec/documents/${encodeURIComponent(featureKey)}/${area}`,
      ),
    retry: false,
  });
  const files = useQuery({
    queryKey: keys.specFiles(featureKey, area),
    queryFn: () =>
      api.get<{ files: SpecFile[] }>(
        `/api/v1/spec/files/${encodeURIComponent(featureKey)}/${area}`,
      ),
  });
  const bodyRef = useRef<HTMLDivElement>(null);
  const [rendered, setRendered] = useState(0);
  const [active, setActive] = useState("");
  const [hover, setHover] = useState<{ slug: string; top: number } | null>(
    null,
  );
  const [preview, setPreview] = useState<SpecFile | null>(null);
  const d = doc.data;

  // Anchors: headings of levels 2–3 get the slugs of the table of contents, in order.
  useEffect(() => {
    const root = bodyRef.current;
    if (!root || !d) return;
    const hs = Array.from(
      root.querySelectorAll<HTMLElement>(".ProseMirror h2, .ProseMirror h3"),
    );
    hs.forEach((h, i) => {
      if (d.toc[i]) h.id = d.toc[i].slug;
    });
    const hash = decodeURIComponent(location.hash.slice(1));
    if (hash) document.getElementById(hash)?.scrollIntoView();
    const io = new IntersectionObserver(
      (entries) => {
        const vis = entries
          .filter((e) => e.isIntersecting)
          .toSorted((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (vis[0]) setActive((vis[0].target as HTMLElement).id);
      },
      { rootMargin: "0px 0px -70% 0px" },
    );
    hs.forEach((h) => io.observe(h));
    return () => io.disconnect();
  }, [d, rendered, location.hash]); // oxlint-disable-line react/exhaustive-effect-dependencies -- the headings are found again after the document is rendered or the anchor changes

  const copyLink = (slug: string) => {
    const url = `${window.location.origin}/spec/${featureKey}/${area}#${encodeURIComponent(slug)}`;
    void navigator.clipboard?.writeText(url);
    toast({ kind: "ok", title: t("spec.linkCopied") });
  };
  const onHover = (e: React.MouseEvent) => {
    const h = (e.target as HTMLElement).closest("h2, h3") as HTMLElement | null;
    if (!h?.id || !bodyRef.current) return;
    setHover({
      slug: h.id,
      top:
        h.getBoundingClientRect().top -
        bodyRef.current.getBoundingClientRect().top,
    });
  };

  if (doc.isLoading) return <Loading />;
  if (doc.error || !d)
    return <Empty icon="alert" title={errorText(t, doc.error)} />;
  const f = d.feature;
  const services = f.pullRequests.filter((p) => p.kind === "service");
  const specPRs = f.pullRequests.filter((p) => p.kind === "spec");
  return (
    <div className="specdoc">
      <div className="specdoc-main">
        <div className="small muted mono">{d.path}</div>
        <div
          className="row"
          style={{ gap: 8, flexWrap: "wrap", margin: "4px 0 8px" }}
        >
          <span className="mono fid">{d.featureKey}</span>
          <h1 className="ftitle" style={{ margin: 0 }}>
            {f.title}
          </h1>
        </div>
        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          {f.source === "repository" ? (
            <span
              className="st none"
              title={
                f.indexedAt ? dateTime(f.indexedAt, i18n.language) : undefined
              }
            >
              <Icon name="refresh" size={12} /> {t("spec.indexed")}
              {f.indexedAt && ` · ${dateTime(f.indexedAt, i18n.language)}`}
            </span>
          ) : f.phase === "released" && f.release ? (
            <Link className="st approved" to={`/releases/${f.release}`}>
              {t("spec.released", { release: f.release })}
            </Link>
          ) : (
            <PhaseBadge phase={f.phase} />
          )}
          {f.parent && (
            <span className="small muted">
              {t("spec.fixOf")}{" "}
              <Link className="mono" to={`/spec/${f.parent}/product`}>
                {f.parent}
              </Link>
            </span>
          )}
          <span className="grow" />
          <Link className="btn ghost sm" to={`/features/${d.featureKey}`}>
            <Icon name="code" size={14} />
            {t("spec.feature")}
          </Link>
          <a
            className="btn ghost sm"
            href={d.historyUrl}
            target="_blank"
            rel="noreferrer"
          >
            <Icon name="clock" size={14} />
            {t("spec.history")}
          </a>
        </div>
        {f.issues.length > 0 && (
          <LinkRow label={t("spec.issues")}>
            {f.issues.map((i) => (
              <Link key={i.key} className="chip" to={i.url}>
                <span className="mono">{i.key}</span> {i.title}
              </Link>
            ))}
          </LinkRow>
        )}
        {f.pullRequests.length > 0 && (
          <LinkRow label={t("spec.implementation")}>
            {services.map((p) => (
              <a
                key={`${p.repo}#${p.number}`}
                className="chip"
                href={p.url}
                target="_blank"
                rel="noreferrer"
              >
                <Icon name="merge" size={12} /> {p.service || p.repo}{" "}
                <span className="mono">#{p.number}</span>
              </a>
            ))}
            {specPRs.map((p) => (
              <a
                key={`${p.repo}#${p.number}`}
                className="chip"
                href={p.url}
                target="_blank"
                rel="noreferrer"
              >
                <Icon name="book" size={12} /> {t("spec.specPR")}{" "}
                <span className="mono">#{p.number}</span>
              </a>
            ))}
          </LinkRow>
        )}
        <div className="tabs" role="tablist" style={{ marginTop: 14 }}>
          {SPEC_AREAS.filter((a) => d.areas.includes(a)).map((a) => (
            <Link
              key={a}
              role="tab"
              aria-selected={a === area}
              className={a === area ? "on" : undefined}
              to={`/spec/${d.featureKey}/${a}`}
            >
              {t(`areas.${a}`)}
            </Link>
          ))}
        </div>
        {f.source === "repository" && (
          <div className="banner info">
            <Icon name="lock" />
            <span className="grow">{t("spec.readOnlyIndexed")}</span>
          </div>
        )}
        <div
          className="doc readonly specmd"
          ref={bodyRef}
          onMouseOver={onHover}
          onMouseLeave={() => setHover(null)}
        >
          <MarkdownEditor
            key={`${d.path}@${d.blobSha}`}
            value={stripFrontMatter(d.markdown)}
            readOnly
            onChange={() => {}}
            onReady={() => setRendered((n) => n + 1)}
            ariaLabel={d.title || d.featureKey}
          />
          {hover && (
            <button
              className="iconbtn anchorbtn"
              style={{ top: hover.top }}
              aria-label={t("spec.copyLink")}
              title={t("spec.copyLink")}
              onClick={() => copyLink(hover.slug)}
            >
              <Icon name="copy" size={13} />
            </button>
          )}
        </div>
        {files.data && files.data.files.length > 0 && (
          <section style={{ marginTop: 20 }}>
            <h2 className="sec">{t("spec.files")}</h2>
            <table className="t">
              <tbody>
                {files.data.files.map((x) => (
                  <tr key={x.path}>
                    <td className="mono small">{x.name}</td>
                    <td className="small muted">
                      {bytes(x.size, i18n.language)}
                    </td>
                    <td className="row" style={{ justifyContent: "flex-end" }}>
                      {x.previewable && (
                        <button
                          className="btn ghost sm"
                          onClick={() => setPreview(x)}
                        >
                          {t("spec.open")}
                        </button>
                      )}
                      <a
                        className="btn ghost sm"
                        href={rawUrl(d.featureKey, area, x.name)}
                      >
                        {t("spec.download")}
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}
      </div>
      {d.toc.length > 0 && (
        <nav className="spectoc" aria-label={t("spec.toc")}>
          <div className="lab">{t("spec.toc")}</div>
          <select
            className="inp tocselect"
            aria-label={t("spec.toc")}
            value={active}
            onChange={(e) =>
              document
                .getElementById(e.target.value)
                ?.scrollIntoView({ behavior: "smooth" })
            }
          >
            <option value="">{t("spec.toc")}</option>
            {d.toc.map((h) => (
              <option key={h.slug} value={h.slug}>
                {h.level === 3 ? "  " : ""}
                {h.text}
              </option>
            ))}
          </select>
          {d.toc.map((h) => (
            <a
              key={h.slug}
              href={`#${h.slug}`}
              className={`lvl${h.level}${active === h.slug ? " on" : ""}`}
              onClick={(e) => {
                e.preventDefault();
                document
                  .getElementById(h.slug)
                  ?.scrollIntoView({ behavior: "smooth" });
                window.history.replaceState(
                  null,
                  "",
                  `#${encodeURIComponent(h.slug)}`,
                );
              }}
            >
              {h.text}
            </a>
          ))}
        </nav>
      )}
      {preview && (
        <FilePreview
          featureKey={d.featureKey}
          area={area}
          file={preview}
          onClose={() => setPreview(null)}
        />
      )}
    </div>
  );
}

function LinkRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="row speclinks">
      <span className="small muted">{label}</span>
      <span className="chips">{children}</span>
    </div>
  );
}

/** The editor shows the body without the YAML front matter. */
export function stripFrontMatter(md: string): string {
  const m = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/.exec(md);
  return m ? md.slice(m[0].length) : md;
}

function rawUrl(key: string, area: string, name: string, mode?: string) {
  return apiUrl(
    `/api/v1/spec/files/${encodeURIComponent(key)}/${area}/raw${qs({ name, mode })}`,
  );
}

/** Images are fetched with the session and shown from an object URL (SVG only in
 * <img>, so its scripts never run); HTML runs in a sandboxed iframe without
 * allow-same-origin: it has no access to the session (arch §8). */
function FilePreview({
  featureKey,
  area,
  file,
  onClose,
}: {
  featureKey: string;
  area: string;
  file: SpecFile;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [src, setSrc] = useState<string | null>(null);
  const [html, setHtml] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let url: string | null = null;
    let cancelled = false;
    (async () => {
      try {
        if (file.mimeType === "text/html") {
          const r = await api.get<{ html: string }>(
            `/api/v1/spec/files/${encodeURIComponent(featureKey)}/${area}/raw${qs({ name: file.name, mode: "preview" })}`,
          );
          if (!cancelled) setHtml(r.html);
          return;
        }
        const res = await fetch(
          rawUrl(featureKey, area, file.name, "preview"),
          { credentials: "include" },
        );
        if (!res.ok) throw new Error(String(res.status));
        url = URL.createObjectURL(await res.blob());
        if (!cancelled) setSrc(url);
      } catch (e) {
        if (!cancelled) setErr(errorText(t, e));
      }
    })();
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [featureKey, area, file, t]);
  return (
    <Modal
      title={file.name}
      wide
      onClose={onClose}
      footer={
        <>
          <a className="btn ghost" href={rawUrl(featureKey, area, file.name)}>
            {t("spec.download")}
          </a>
          <button className="btn" onClick={onClose}>
            {t("common.close")}
          </button>
        </>
      }
    >
      {err && <div className="err-text">{err}</div>}
      {!err && !src && html === null && <Loading />}
      {src && <img className="specimg" src={src} alt={file.name} />}
      {html !== null && (
        <iframe
          className="spechtml"
          title={file.name}
          sandbox="allow-scripts"
          srcDoc={html}
        />
      )}
    </Modal>
  );
}

// ─── search (R14) ───────────────────────────────────────────────────

function SearchResults({ q }: { q: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [domain, setDomain] = useState("");
  const [area, setArea] = useState("");
  const [extra, setExtra] = useState<SpecSearchResult["items"]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const tree = useQuery({
    queryKey: keys.specTree,
    queryFn: () => api.get<SpecTree>("/api/v1/spec/tree"),
  });
  const res = useQuery({
    queryKey: keys.specSearch(q, domain, area),
    queryFn: () =>
      api.get<SpecSearchResult>(
        `/api/v1/spec/search${qs({ q, domain, area, limit: 20 })}`,
      ),
  });
  // A new search starts from the first page: reset during render, without an effect.
  const searchKey = `${q}\n${domain}\n${area}`;
  const [pagesOf, setPagesOf] = useState(searchKey);
  if (pagesOf !== searchKey) {
    setPagesOf(searchKey);
    setExtra([]);
    setCursor(null);
  }
  const next = cursor ?? res.data?.nextCursor ?? null;
  const more = async () => {
    if (!next) return;
    const r = await api.get<SpecSearchResult>(
      `/api/v1/spec/search${qs({ q, domain, area, limit: 20, cursor: next })}`,
    );
    setExtra((x) => [...x, ...r.items]);
    setCursor(r.nextCursor ?? "");
  };
  const items = useMemo(
    () => [...(res.data?.items ?? []), ...extra],
    [res.data, extra],
  );
  return (
    <div>
      <div className="filters">
        <div className="chips" role="group" aria-label={t("spec.domain")}>
          <button
            className={`chip${domain === "" ? " on" : ""}`}
            onClick={() => setDomain("")}
          >
            {t("spec.allDomains")}
          </button>
          {tree.data?.domains.map((d) => (
            <button
              key={d.key}
              className={`chip${domain === d.key ? " on" : ""}`}
              onClick={() => setDomain(d.key)}
            >
              {d.key}
            </button>
          ))}
        </div>
        <div className="chips" role="group" aria-label={t("spec.area")}>
          <button
            className={`chip${area === "" ? " on" : ""}`}
            onClick={() => setArea("")}
          >
            {t("spec.allAreas")}
          </button>
          {SPEC_AREAS.map((a) => (
            <button
              key={a}
              className={`chip${area === a ? " on" : ""}`}
              onClick={() => setArea(a)}
            >
              {t(`areas.${a}`)}
            </button>
          ))}
        </div>
      </div>
      {res.isLoading && <Loading />}
      {res.error && <div className="err-text">{errorText(t, res.error)}</div>}
      {res.data && (
        <div className="small muted" style={{ margin: "8px 0" }}>
          {t("spec.found", { count: res.data.total })}
        </div>
      )}
      {res.data && res.data.total === 0 && (
        <Empty icon="search" title={t("spec.nothingFound")} />
      )}
      <div className="searchres">
        {items.map((it) => (
          <button
            key={`${it.path}`}
            className="hit"
            onClick={() => navigate(`/spec/${it.featureKey}/${it.area}`)}
          >
            <div className="small muted mono">{it.path}</div>
            <div className="row" style={{ gap: 8 }}>
              <span className="mono fid">{it.featureKey}</span>
              <span className="st none">
                {t(`areas.${it.area}`)}
                {it.section && ` · ${it.section}`}
              </span>
              <b className="ellipsis">{it.featureTitle}</b>
            </div>
            {it.snippet && (
              <div className="snippet">{highlight(it.snippet)}</div>
            )}
          </button>
        ))}
      </div>
      {next && (
        <button className="btn ghost sm" onClick={() => void more()}>
          {t("spec.more")}
        </button>
      )}
    </div>
  );
}

/** Snippets frame matches with ‹ and ›; the text is rendered as text and the
 * matches as <mark>, so markup from a document never runs (SRC-05). */
export function highlight(snippet: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /‹([^›]*)›/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(snippet))) {
    if (m.index > last) out.push(snippet.slice(last, m.index));
    out.push(<mark key={i++}>{m[1]}</mark>);
    last = m.index + m[0].length;
  }
  if (last < snippet.length) out.push(snippet.slice(last));
  return out;
}
