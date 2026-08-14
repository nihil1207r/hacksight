"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, CheckCircle2, Loader2, AlertOctagon, ShieldAlert } from "lucide-react";
import { Card } from "@/components/ui/card";
import { quickScan, type QuickScanResult } from "@/lib/quickScan";
import { bandColorVar } from "@/lib/patterns";

type CardState =
  | { status: "scanning" }
  | { status: "done"; result: QuickScanResult }
  | { status: "error"; message: string };

function bandLabel(band: "low" | "medium" | "critical"): string {
  if (band === "critical") return "Do not share";
  if (band === "medium") return "Think again";
  return "Looks safe";
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

  const scannedCount = [...states.values()].filter((s) => s.status !== "scanning").length;

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

      <h1 className="font-display mb-1.5 text-[26px] font-semibold">Checking {files.length} images</h1>
      <p className="mb-8 text-[14px]" style={{ color: "var(--muted)" }}>
        Scanning locally, all at once — {scannedCount} of {files.length} done. Click any image once it finishes for the full report.
      </p>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
        {files.map((file, i) => {
          const state = states.get(file) ?? { status: "scanning" as const };
          const url = previewUrls.current.get(file);
          const clickable = state.status === "done";
          return (
            <Card
              key={i}
              onClick={() => clickable && onOpenAnalysis(file)}
              className="overflow-hidden p-0"
              style={{ cursor: clickable ? "pointer" : "default", opacity: state.status === "scanning" ? 0.85 : 1 }}
            >
              <div className="relative aspect-video w-full overflow-hidden" style={{ background: "#0d0e12" }}>
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
          All images scanned. Click one to see its full report.
        </div>
      )}
    </div>
  );
}
