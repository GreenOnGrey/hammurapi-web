import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { Icon, Loading } from "@green-on-grey/ui-kit";
import { api, ApiError, qs } from "../api/client";
import { apiUrl } from "../api/base";
import type { SpecFile } from "../api/types";
import { errorText } from "../lib/errors";

export function rawUrl(key: string, area: string, name: string, mode?: string) {
  return apiUrl(
    `/api/v1/spec/files/${encodeURIComponent(key)}/${area}/raw${qs({ name, mode })}`,
  );
}

/** The URL of a file opened as a page of its own: in the frame of the viewer and
 * in a new tab (FTR.HMR.SPEC-0001 R6). Absent in older cores. */
export function viewHref(file: Pick<SpecFile, "viewUrl">): string | undefined {
  return file.viewUrl ? apiUrl(file.viewUrl) : undefined;
}

/** The first file the viewer shows when it is opened by name. */
export function pickFile(files: SpecFile[], name: string): SpecFile | undefined {
  return files.find((f) => f.name === name) ?? files[0];
}

/** Files of an area over the whole screen (FTR.HMR.SPEC-0001 R5–R7, design §3.3).
 *
 * Repository HTML runs in a frame sandboxed without allow-same-origin, and the
 * core serves it in view mode with `CSP: sandbox allow-scripts`: the mockup lives
 * in an opaque origin and has no access to the session — in the frame and in a
 * new tab (arch §6). Without `viewUrl` (an older core) the HTML comes as JSON
 * for srcdoc, as before. Images are fetched with the session and shown from an
 * object URL (SVG only in <img>, so its scripts never run). */
export function FileViewer({
  featureKey,
  area,
  files,
  initial,
  onClose,
}: {
  featureKey: string;
  area: string;
  files: SpecFile[];
  initial: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState(initial);
  const file = pickFile(files, name);
  const box = useRef<HTMLDivElement>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);
  // the parent passes a new function on every render; the dialog is set up once
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  }, [onClose]);

  // A dialog: the focus starts on "✕", stays inside, Esc closes; the page under it does not scroll.
  useEffect(() => {
    closeBtn.current?.focus();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close.current();
      } else if (e.key === "Tab" && box.current) {
        const all = Array.from(
          box.current.querySelectorAll<HTMLElement>("button, a[href], select, iframe, [tabindex]"),
        ).filter((el) => !el.hasAttribute("disabled") && el.tabIndex !== -1);
        if (all.length === 0) return;
        const first = all[0];
        const last = all[all.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, []);

  if (!file) return null;
  const view = viewHref(file);
  const isHtml = file.mimeType === "text/html";
  return createPortal(
    <div className="fileviewer-scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="fileviewer" role="dialog" aria-modal="true" aria-labelledby="fileviewer-name" ref={box}>
        <div className="fileviewer-h">
          <Icon name={isHtml ? "code" : "image"} size={16} />
          <b id="fileviewer-name" className="fileviewer-name">{file.name}</b>
          {files.length > 1 && (
            <select
              className="inp fileviewer-pick"
              aria-label={t("spec.files")}
              value={file.name}
              onChange={(e) => setName(e.target.value)}
            >
              {files.map((f) => (
                <option key={f.path} value={f.name}>{f.name}</option>
              ))}
            </select>
          )}
          <span className="fileviewer-grow" />
          {view && (
            <button
              className="btn ghost sm"
              onClick={() => window.open(view, "_blank", "noopener,noreferrer")}
              title={t("spec.openInNewTab")}
            >
              <Icon name="ext" size={14} />
              <span className="fileviewer-lbl">{t("spec.openInNewTab")}</span>
            </button>
          )}
          <a className="btn ghost sm" href={rawUrl(featureKey, area, file.name)} title={t("spec.download")}>
            <Icon name="download" size={14} />
            <span className="fileviewer-lbl">{t("spec.download")}</span>
          </a>
          <button ref={closeBtn} className="iconbtn" onClick={onClose} aria-label={t("common.close")}>
            <Icon name="x" />
          </button>
        </div>
        <div className="fileviewer-b">
          {isHtml ? (
            view ? (
              <iframe
                key={file.path}
                className="fileviewer-frame"
                title={file.name}
                src={view}
                sandbox="allow-scripts"
                referrerPolicy="no-referrer"
              />
            ) : (
              <HtmlPreview key={file.path} featureKey={featureKey} area={area} file={file} />
            )
          ) : (
            <ImageView key={file.path} featureKey={featureKey} area={area} file={file} />
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function failure(t: TFunction, e: unknown): string {
  return e instanceof ApiError && e.code === "spec_file_too_large" ? t("spec.tooLarge") : errorText(t, e);
}

/** An older core: the HTML as JSON for srcdoc (FTR.HMR.CMN-0005 arch §8). */
function HtmlPreview({ featureKey, area, file }: { featureKey: string; area: string; file: SpecFile }) {
  const { t } = useTranslation();
  const [html, setHtml] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    api
      .get<{ html: string }>(
        `/api/v1/spec/files/${encodeURIComponent(featureKey)}/${area}/raw${qs({ name: file.name, mode: "preview" })}`,
      )
      .then((r) => !cancelled && setHtml(r.html))
      .catch((e: unknown) => !cancelled && setErr(failure(t, e)));
    return () => {
      cancelled = true;
    };
  }, [featureKey, area, file, t]);
  if (err) return <Failure text={err} href={rawUrl(featureKey, area, file.name)} />;
  if (html === null) return <Loading />;
  return <iframe className="fileviewer-frame" title={file.name} sandbox="allow-scripts" srcDoc={html} />;
}

function ImageView({ featureKey, area, file }: { featureKey: string; area: string; file: SpecFile }) {
  const { t } = useTranslation();
  const [src, setSrc] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [natural, setNatural] = useState(false);
  useEffect(() => {
    let url: string | null = null;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(rawUrl(featureKey, area, file.name, "preview"), { credentials: "include" });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { code?: string; message?: string };
          throw new ApiError(res.status, body.code ?? "", body.message ?? String(res.status));
        }
        url = URL.createObjectURL(await res.blob());
        if (!cancelled) setSrc(url);
      } catch (e) {
        if (!cancelled) setErr(failure(t, e));
      }
    })();
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [featureKey, area, file, t]);
  if (err) return <Failure text={err} href={rawUrl(featureKey, area, file.name)} />;
  if (!src) return <Loading />;
  return (
    <div className={`fileviewer-img${natural ? " natural" : ""}`}>
      <img
        src={src}
        alt={file.name}
        title={natural ? t("spec.fitToScreen") : t("spec.actualSize")}
        onClick={() => setNatural((v) => !v)}
      />
    </div>
  );
}

function Failure({ text, href }: { text: string; href: string }) {
  const { t } = useTranslation();
  return (
    <div className="fileviewer-err">
      <div className="err-text">{text}</div>
      <a className="btn ghost sm" href={href}>
        <Icon name="download" size={14} />
        {t("spec.download")}
      </a>
    </div>
  );
}
