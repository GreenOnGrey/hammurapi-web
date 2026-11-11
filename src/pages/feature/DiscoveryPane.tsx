import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Empty, Loading } from "@green-on-grey/ui-kit";
import { apiUrl } from "../../api/base";
import { qs } from "../../api/client";
import type { FeatureDiscovery, GateFile } from "../../api/types";
import { FileViewer, type FileHref } from "../../components/FileViewer";
import { MarkdownEditor } from "../../editor/MarkdownEditor";
import { bytes } from "../../lib/format";
import { errorText } from "../../lib/errors";

/** True when the feature has a Discovery document or materials: the tab «Analysis» is shown only then. */
export function hasDiscovery(d: FeatureDiscovery | undefined): boolean {
  return !!d && (!!d.document || (d.files?.length ?? 0) > 0);
}

/** The tab «Analysis» of a feature: the Discovery document and the materials of the research
 * beside it, read-only, without anything of a gate (FTR.HMR.DISC-0001 R30, design §3.7a). */
export function DiscoveryPane({ featureId, data, loading, error }: {
  featureId: string; data?: FeatureDiscovery; loading: boolean; error: unknown;
}) {
  const { t, i18n } = useTranslation();
  const [preview, setPreview] = useState<GateFile | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  const href: FileHref = (name, mode) => apiUrl(`/api/v1/features/${featureId}/discovery/files/raw${qs({ name, mode })}`);
  if (loading) return <Loading />;
  if (error) return <Empty icon="alert" title={errorText(t, error)} />;
  if (!data || !hasDiscovery(data)) return <Empty icon="files" title={t("discovery.empty")} />;
  const files = data.files ?? [];
  return (
    <div className="discoverypane">
      {data.document && (
        <>
          <div className="small muted mono">{data.document.path}</div>
          <div className="doc readonly specmd">
            <MarkdownEditor key={`${data.document.path}@${data.document.blobSha}`} value={data.document.markdown} readOnly
              onChange={() => {}} ariaLabel={t("areas.discovery")} />
          </div>
        </>
      )}
      {files.length > 0 && (
        <section style={{ marginTop: 20 }}>
          <h2 className="sec">{t("discovery.materials")}</h2>
          <table className="t">
            <tbody>
              {files.map((x) => (
                <tr key={x.name}>
                  <td className="mono small">{x.name}</td>
                  {/* GitLab gives no size in a tree: -1 (FTR.HMR.DISC-0001 tech §3.6) */}
                  <td className="small muted">{x.size >= 0 ? bytes(x.size, i18n.language) : "—"}</td>
                  <td className="row" style={{ justifyContent: "flex-end" }}>
                    {x.previewable && (
                      <button className="btn ghost sm" onClick={(e) => {
                        opener.current = e.currentTarget;
                        setPreview(x);
                      }}>{t("spec.open")}</button>
                    )}
                    <a className="btn ghost sm" href={href(x.name)}>{t("spec.download")}</a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
      {preview && (
        <FileViewer featureKey={featureId} area="discovery" files={files.filter((x) => x.previewable)} initial={preview.name} href={href}
          onClose={() => {
            setPreview(null);
            opener.current?.focus();
          }} />
      )}
    </div>
  );
}
