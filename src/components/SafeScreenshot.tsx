"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Download, Share2, CheckCircle2, ShieldCheck, Loader2, AlertOctagon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { generateSafeImage, SafeImageResult } from "@/lib/redact";
import type { Finding } from "@/lib/detectSecrets";

type Status = "idle" | "generating" | "ready" | "error";
type ActionState = "none" | "downloaded" | "shared" | "share_unsupported";

function safeFileName(original: string) {
  const dot = original.lastIndexOf(".");
  const base = dot > 0 ? original.slice(0, dot) : original;
  return `${base}-safe.png`.replace(/[^a-z0-9._-]/gi, "_");
}

export function SafeScreenshot({ file, findings }: { file: File; findings: Finding[] }) {
  const [status, setStatus] = useState<Status>("idle");
  const [result, setResult] = useState<SafeImageResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [action, setAction] = useState<ActionState>("none");

  useEffect(() => {
    let cancelled = false;
    setStatus("generating");
    setAction("none");

    generateSafeImage(file, findings)
      .then((r) => {
        if (cancelled) return;
        setResult(r);
        setStatus("ready");
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Could not generate a safe version.");
        setStatus("error");
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file, findings.length]);

  function handleDownload() {
    if (!result) return;
    const a = document.createElement("a");
    a.href = result.dataUrl;
    a.download = safeFileName(file.name);
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setAction("downloaded");
  }

  async function handleShareSafely() {
    if (!result) return;
    const shareFile = new File([result.blob], safeFileName(file.name), { type: "image/png" });

    const nav = typeof navigator !== "undefined" ? navigator : null;
    const canNativeShare =
      !!nav && "share" in nav && "canShare" in nav && nav.canShare?.({ files: [shareFile] });

    if (canNativeShare) {
      try {
        await nav!.share({
          files: [shareFile],
          title: "Safe screenshot",
          text: "Checked with HackSight AI — sensitive values redacted.",
        });
        setAction("shared");
      } catch (err) {
        // AbortError just means the user closed the share sheet — not an error state.
        if (err instanceof Error && err.name === "AbortError") return;
        setAction("share_unsupported");
        handleDownload();
      }
    } else {
      setAction("share_unsupported");
      handleDownload();
    }
  }

  const redactedCount = findings.length;

  return (
    <Card style={{ padding: 22 }}>
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShieldCheck size={17} color={redactedCount > 0 ? "var(--red)" : "var(--green)"} />
          <span className="font-display text-[15px] font-semibold">
            {redactedCount > 0 ? "Your safe screenshot" : "Already safe to share"}
          </span>
        </div>
        <span className="font-mono text-[11px]" style={{ color: "var(--muted-dim)" }}>
          generated locally, never uploaded
        </span>
      </div>

      <p className="mb-4 text-[13px] leading-relaxed" style={{ color: "var(--muted)" }}>
        {redactedCount > 0
          ? `${redactedCount} sensitive region${redactedCount === 1 ? "" : "s"} permanently pixelated. The rest of your screenshot is untouched.`
          : "No sensitive regions were found, so this is just your original screenshot — download it as your record that HackSight checked it."}
      </p>

      <div
        className="mb-4 flex items-center justify-center overflow-hidden rounded-xl"
        style={{ border: "1px solid var(--hairline)", background: "#0d0e12", minHeight: 200 }}
      >
        {status === "generating" && (
          <div className="flex flex-col items-center gap-2 py-10" style={{ color: "var(--muted-dim)" }}>
            <Loader2 size={20} className="animate-spin-slow" />
            <span className="font-mono text-[11.5px]">generating safe version…</span>
          </div>
        )}
        {status === "error" && (
          <div className="flex flex-col items-center gap-2 py-10 text-center" style={{ color: "var(--amber)" }}>
            <AlertOctagon size={20} />
            <span className="font-mono text-[11.5px]">{error}</span>
          </div>
        )}
        {status === "ready" && result && (
          // eslint-disable-next-line @next/next/no-img-element -- data: URL generated client-side from canvas
          <img src={result.dataUrl} alt="Safe, redacted screenshot" style={{ width: "100%", display: "block" }} />
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2.5">
        <button
          onClick={handleDownload}
          disabled={status !== "ready"}
          className="font-mono flex items-center gap-2 rounded-full px-4 py-2.5 text-[12.5px] font-medium"
          style={{
            background: "var(--red)",
            color: "#0a0a0a",
            border: "none",
            cursor: status === "ready" ? "pointer" : "not-allowed",
            opacity: status === "ready" ? 1 : 0.5,
          }}
        >
          <Download size={14} />
          Download Safe Version
        </button>
        <button
          onClick={handleShareSafely}
          disabled={status !== "ready"}
          className="font-mono flex items-center gap-2 rounded-full px-4 py-2.5 text-[12.5px] font-medium"
          style={{
            background: "none",
            color: "var(--text)",
            border: "1px solid var(--hairline-strong)",
            cursor: status === "ready" ? "pointer" : "not-allowed",
            opacity: status === "ready" ? 1 : 0.5,
          }}
        >
          <Share2 size={14} />
          Share Safely
        </button>

        <AnimatePresence mode="wait">
          {action !== "none" && (
            <motion.div
              key={action}
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="font-mono flex items-center gap-1.5 text-[12px]"
              style={{ color: "var(--green)" }}
            >
              <CheckCircle2 size={14} />
              {action === "shared" && "Shared — safely."}
              {action === "downloaded" && "Downloaded — safe to share."}
              {action === "share_unsupported" && "Native share isn't supported here — downloaded instead."}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </Card>
  );
}
