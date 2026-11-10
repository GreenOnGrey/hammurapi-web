import { useEffect, useRef, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Icon } from "@green-on-grey/ui-kit";
import { apiUrl } from "../../api/base";
import { qs } from "../../api/client";
import { useGateFiles } from "../../api/queries";
import type { Area, GateFile } from "../../api/types";
import { Failure, FileViewer, ImageView, MockupFrame, pickFile, viewHref, type FileHref } from "../../components/FileViewer";
import { ContractView, contractLabel, isContract } from "../../components/ContractView";
import { useMockupTheme } from "../../lib/mockupTheme";

/** The phone and a narrow window: the mockup opens over the whole screen only (FTR.HMR.DEV-0003 R3). */
function useNarrow(): boolean {
  const q = "(max-width: 767px)";
  const [narrow, setNarrow] = useState(() => window.matchMedia?.(q).matches ?? false);
  useEffect(() => {
    const m = window.matchMedia?.(q);
    if (!m) return;
    const on = () => setNarrow(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return narrow;
}

/** «Документ | Макет» on a gate with files (FTR.HMR.DEV-0003 R1–R4, design §3.1), «Документ | API» on tech with
 * contracts (FTR.HMR.SPEC-0004 R7): the document stays mounted and hidden while a file is shown, so an unsaved edit
 * and the autosave go on. The mode and the file are in the address; the theme is the one of the application. */
export function GateView({ featureId, area, children }: { featureId: string; area: Area; children: ReactNode }) {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const files = useGateFiles(featureId, area);
  // tech with contracts shows them as API; otherwise the previewable files are mockups
  const previewable = (files.data?.files ?? []).filter((f) => f.previewable);
  const contracts = previewable.filter((f) => isContract(f.mimeType));
  const api = area === "tech" && contracts.length > 0;
  const viewMode = api ? "api" : "mockup";
  const list = api ? contracts : previewable.filter((f) => !isContract(f.mimeType));
  const mockup = params.get("view") === viewMode && list.length > 0;
  const file = pickFile(list, params.get("file") ?? "");
  const theme = useMockupTheme();
  const [full, setFull] = useState(false);
  const narrow = useNarrow();
  const href: FileHref = (name, mode) => apiUrl(`/api/v1/features/${featureId}/gates/${area}/files/raw${qs({ name, mode })}`);

  // R4: a new version of the open file — a note for a while; a removed file — the first one left
  const seen = useRef<{ name: string; sha: string } | null>(null);
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => {
    if (!file) return;
    const prev = seen.current;
    seen.current = { name: file.name, sha: file.blobSha };
    if (!prev) return;
    let text: string | null = null;
    if (prev.name === file.name && prev.sha !== file.blobSha) text = t("gate.view.updated");
    else if (prev.name !== file.name && !list.some((f) => f.name === prev.name)) text = t("gate.view.removed", { name: prev.name, open: file.name });
    if (!text) return;
    setNote(text); // oxlint-disable-line react/set-state-in-effect -- the note follows a new version of the file
    const id = window.setTimeout(() => setNote(null), 4000);
    return () => window.clearTimeout(id);
  }, [file?.name, file?.blobSha]); // oxlint-disable-line react/exhaustive-effect-dependencies, react-hooks/exhaustive-deps

  const set = (next: Record<string, string | null>) =>
    setParams((p) => {
      const q = new URLSearchParams(p);
      for (const [k, v] of Object.entries(next)) {
        if (v === null) q.delete(k);
        else q.set(k, v);
      }
      return q;
    }, { replace: true });

  // one tree whether there are files or not: the editor is never mounted again (its unsaved edit stays)
  return (
    <div className="gateview">
      {list.length > 0 && <div className="gateview-bar">
        <div className="seg" role="group" aria-label={t("gate.view.mode")}>
          <button type="button" aria-pressed={!mockup} onClick={() => set({ view: null, file: null })}>
            {t("gate.view.document")}
          </button>
          <button type="button" aria-pressed={mockup}
            onClick={() => set({ view: viewMode, file: file?.name ?? null })}>
            {api ? t("gate.view.api") : t("gate.view.mockup")}
          </button>
        </div>
        {mockup && file && (
          <>
            {list.length > 1 ? (
              <select className="inp gateview-file" aria-label={t("gate.view.file")} value={file.name} onChange={(e) => set({ file: e.target.value })}>
                {list.map((f) => <option key={f.name} value={f.name}>{api ? contractLabel(f) : f.name}</option>)}
              </select>
            ) : (
              <span className="gateview-name mono">{api ? contractLabel(file) : file.name}</span>
            )}
            <span className="gateview-grow" />
            <button type="button" className="btn sm" onClick={() => setFull(true)}>
              <Icon name="ext" size={14} />
              {t("gate.view.fullscreen")}
            </button>
          </>
        )}
      </div>}
      {note && mockup && <div className="gateview-note small" role="status">{note}</div>}
      <div hidden={mockup}>{children}</div>
      {mockup && file && !narrow && <GateMockup file={file} href={href} theme={theme} />}
      {mockup && file && narrow && (
        <div className="gateview-card">
          <span className="grow-text">{t("gate.view.narrow")}</span>
        </div>
      )}
      {full && file && (
        <FileViewer featureKey={featureId} area={area} files={list} initial={file.name} href={href}
          onClose={(name) => {
            setFull(false);
            if (name !== file.name) set({ file: name });
          }} />
      )}
    </div>
  );
}

function GateMockup({ file, href, theme }: { file: GateFile; href: FileHref; theme: ReturnType<typeof useMockupTheme> }) {
  const { t } = useTranslation();
  const [natural, setNatural] = useState(false);
  const view = viewHref(file);
  if (isContract(file.mimeType)) {
    return <ContractView key={`${file.name}@${file.blobSha}`} file={file} href={href} theme={theme} className="gateview-frame" />;
  }
  if (file.mimeType === "text/html") {
    // an older core gives no viewUrl: the file is downloaded, never shown from the index
    return view
      ? <MockupFrame key={`${file.name}@${file.blobSha}`} className="gateview-frame" title={file.name} href={view} theme={theme} />
      : <Failure text={t("spec.tooLarge")} href={href(file.name)} />;
  }
  return (
    <div className="gateview-image">
      <ImageView key={`${file.name}@${file.blobSha}`} file={file} href={href} natural={natural} onToggle={() => setNatural((v) => !v)} />
    </div>
  );
}
