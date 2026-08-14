"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, CheckCircle2, Loader2, AlertOctagon, ShieldAlert, Download, DownloadCloud } from "lucide-react";
import { Card } from "@/components/ui/card";
import { quickScan, type QuickScanResult } from "@/lib/quickScan";
import { generateSafeImage } from "@/lib/redact";
import { bandColorVar } from "@/lib/patterns";

type CardState =
  | { status: "scanning" }
  | { status: "done"; result: QuickScanResult }
  | { status: "error"; message: string };

type DownloadState = "idle" | "working" | "done" | "error";

function bandLabel(band: "low" | "medium" | "critical"): string {
  if (band === "critical") return "Do not share";
  if (band === "medium") return "Think again";
  return "Looks safe";
}

function safeFileName(original: string): string {
  const dot = original.lastIndexOf(".");
  const base = dot > 0 ? original.slice(0, dot) : original || "image";
  return `${base}-safe.png`.replace(/[^a-z0-9._-]/gi, "_");
}

function triggerDownload(dataUrl: string, filename: string): void {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

export function BatchResultsScreen({
  files,
  deepScan,
  cloudDeepScan,
  onOpenAnalysis,
  onReset,
}: {
  files: File[];
  deepScan: boolean;
  cloudDeepScan: boolean;
  onOpenAnalysis: (file: File) => void;
  onReset: () => void;
}) {
  const [states, setStates] = useState<Map<File, CardState>>(() => new Map(files.map((file) => [file, { status: "scanning" }])));
  const [downloads, setDownloads] = useState<Map<File, DownloadState>>(() => new Map());
  const [downloadingAll, setDownloadingAll] = useState(false);
  const previewUrls = useRef<Map<File, string>>(new Map());

  useEffect(() => {
    // All images scan concurrently — none of these depend on each other,
    // so there's no reason to wait for one before starting the next. Each
    // card updates independently as its own scan finishes.
    let cancelled = false;
    files.forEach((file) => {
      quickScan(file, deepScan, cloudDeepScan)
        .then((result) => {
          if (cancelled) return;
          setStates((prev) => new Map(prev).set(file, { status: "done", result }));
        })
        .catch((error: unknown) => {
          if (cancelled) return;
          const message = error instanceof Error ? error.message : "Could not scan this image.";
          setStates((prev) => new Map(prev).set(file, { status: "error", message }));
        });
    });
    return () => {
      cancelled = true;
    };
    // files/deepScan/cloudDeepScan are fixed for the lifetime of this screen
    // (a new batch means a new BatchResultsScreen instance from page.tsx).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const urls = previewUrls.current;
    files.forEach((file) => {
      if (!urls.has(file)) urls.set(file, URL.createObjectURL(file));
    });
    return () => {
      urls.forEach((url) => URL.revokeObjectURL(url));
      urls.clear();
    };
  }, [files]);

  async function downloadRedacted(file: File, result: QuickScanResult): Promise<boolean> {
    setDownloads((prev) => new Map(prev).set(file, "working"));
    try {
      const safe = await generateSafeImage(file, result.detection.findings);
      triggerDownload(safe.dataUrl, safeFileName(file.name));
      setDownloads((prev) => new Map(prev).set(file, "done"));
      return true;
    } catch {
      setDownloads((prev) => new Map(prev).set(file, "error"));
      return false;
    }
  }

  async function downloadAllFlagged(): Promise<void> {
    const flagged = files
      .map((file) => ({ file, state: states.get(file) }))
      .filter((entry): entry is { file: File; state: Extract<CardState, { status: "done" }> } => entry.state?.status === "done" && entry.state.result.detection.findings.length > 0);
    if (flagged.length === 0) return;
    setDownloadingAll(true);
    // Sequential on purpose — triggering many simultaneous downloads at
    // once is what makes browsers show a "this site is downloading
    // multiple files" block prompt; one at a time avoids that entirely.
    for (const { file, state } of flagged) {
      await downloadRedacted(file, state.result);
    }
    setDownloadingAll(false);
  }

  const scannedCount = [...states.values()].filter((s) => s.status !== "scanning").length;
  const flaggedCount = [...states.values()].filter((s) => s.status === "done" && s.result.detection.findings.length > 0).length;

  return (
    <div className="mx-auto max-w-[1040px] px-6 pb-24 pt-11">
      <button
        onClick={onReset}
        className="mb-6 flex items-center gap-1.5 text-[13px] font-medium transition-opacity hover:opacity-80"
        style={{ color: "var(--muted)" }}
      >
        <ArrowLeft size={14} />
        Start over
      </button>

      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display mb-1.5 text-[26px] font-semibold">Checking {files.length} images</h1>
          <p className="text-[14px]" style={{ color: "var(--muted)" }}>
            Scanning locally, all at once — {scannedCount} of {files.length} done. Click any image for the full report, or download a
            redacted copy straight from its card.
          </p>
        </div>
        {flaggedCount > 1 && (
          <button
            onClick={downloadAllFlagged}
            disabled={downloadingAll}
            className="flex flex-none items-center gap-1.5 rounded-lg px-3.5 py-2 text-[12.5px] font-semibold transition-opacity hover:opacity-90 disabled:opacity-60"
            style={{ background: "var(--green)", color: "#08120c" }}
          >
            {downloadingAll ? <Loader2 size={14} className="animate-spin-slow" /> : <DownloadCloud size={14} />}
            {downloadingAll ? "Downloading…" : `Download ${flaggedCount} redacted copies`}
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
        {files.map((file, i) => {
          const state = states.get(file) ?? { status: "scanning" as const };
          const downloadState = downloads.get(file) ?? "idle";
          const url = previewUrls.current.get(file);
          const clickable = state.status === "done";
          const hasFindings = state.status === "done" && state.result.detection.findings.length > 0;
          return (
            <Card key={i} className="overflow-hidden p-0" style={{ opacity: state.status === "scanning" ? 0.85 : 1 }}>
              <div
                onClick={() => clickable && onOpenAnalysis(file)}
                className="relative aspect-video w-full overflow-hidden"
                style={{ background: "#0d0e12", cursor: clickable ? "pointer" : "default" }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- blob: URL from a local File, next/image can't optimize this */}
                {url && <img src={url} alt="" className="h-full w-full object-cover" />}
                <div className="absolute inset-x-0 bottom-0 flex items-center gap-1.5 px-2.5 py-2" style={{ background: "linear-gradient(0deg,#000d,transparent)" }}>
                  {state.status === "scanning" && <Loader2 size={13} color="#fff" className="animate-spin-slow" />}
                  {state.status === "done" && <ShieldAlert size={13} color={bandColorVar(state.result.detection.band)} />}
                  {state.status === "error" && <AlertOctagon size={13} color="var(--red)" />}
                  <span className="truncate text-[11.5px] font-semibold text-white">
                    {state.status === "scanning" && "Scanning…"}
                    {state.status === "done" &&
                      `${bandLabel(state.result.detection.band)} · ${state.result.detection.findings.length} finding${state.result.detection.findings.length === 1 ? "" : "s"}`}
                    {state.status === "error" && "Scan failed"}
                  </span>
                </div>
                {hasFindings && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (downloadState !== "working") void downloadRedacted(file, (state as Extract<CardState, { status: "done" }>).result);
                    }}
                    disabled={downloadState === "working"}
                    title="Download a redacted copy of just this image"
                    className="absolute right-2 top-2 flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold backdrop-blur-sm transition-opacity hover:opacity-90 disabled:opacity-70"
                    style={{ background: downloadState === "done" ? "var(--green-dim)" : "#000000b3", color: downloadState === "done" ? "var(--green)" : "#fff" }}
                  >
                    {downloadState === "working" && <Loader2 size={11} className="animate-spin-slow" />}
                    {downloadState === "done" && <CheckCircle2 size={11} />}
                    {(downloadState === "idle" || downloadState === "error") && <Download size={11} />}
                    {downloadState === "working" ? "Redacting…" : downloadState === "done" ? "Downloaded" : downloadState === "error" ? "Retry" : "Redacted copy"}
                  </button>
                )}
              </div>
              <div className="truncate px-2.5 py-2 text-[12px]" style={{ color: "var(--muted)" }}>
                {file.name || "Image"}
              </div>
            </Card>
          );
        })}
      </div>

      {scannedCount === files.length && (
        <div className="mt-6 flex items-center gap-1.5 text-[12.5px]" style={{ color: "var(--muted-dim)" }}>
          <CheckCircle2 size={13} />
          All images scanned. Click one to see its full report, or use the download button on any flagged card.
        </div>
      )}
    </div>
  );
}