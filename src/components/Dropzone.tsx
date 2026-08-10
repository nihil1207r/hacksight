"use client";

import { useCallback, useEffect, useState } from "react";
import { useDropzone, FileRejection } from "react-dropzone";
import { ScanEye, Lock, AlertOctagon, Clipboard } from "lucide-react";
import { Card } from "@/components/ui/card";

const MAX_SIZE_BYTES = 15 * 1024 * 1024; // 15MB — large screenshots are fine, but this keeps OCR/canvas memory sane
const ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/webp"];

function rejectionMessage(rejections: FileRejection[]): string {
  const first = rejections[0];
  if (!first) return "That file couldn't be used.";
  const code = first.errors[0]?.code;
  if (code === "file-too-large") return "That image is over 15MB — try a smaller screenshot.";
  if (code === "file-invalid-type") return "HackSight only reads images (PNG, JPG, WEBP).";
  if (code === "too-many-files") return "Drop one screenshot at a time.";
  return first.errors[0]?.message ?? "That file couldn't be used.";
}

export function Dropzone({ onFile }: { onFile: (file: File) => void }) {
  const [error, setError] = useState<string | null>(null);

  const onDrop = useCallback(
    (accepted: File[], rejections: FileRejection[]) => {
      if (rejections.length > 0) {
        setError(rejectionMessage(rejections));
        return;
      }
      if (accepted[0]) {
        setError(null);
        onFile(accepted[0]);
      }
    },
    [onFile]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "image/png": [], "image/jpeg": [], "image/webp": [] },
    maxFiles: 1,
    maxSize: MAX_SIZE_BYTES,
  });

  // Paste-to-upload: Ctrl/Cmd+V anywhere on the page while the dropzone is
  // mounted. Listens on `window` (not a focusable element) since a plain
  // <div> never receives paste events without being focused first, which is
  // the usual reason "paste" silently does nothing in a dropzone like this.
  useEffect(() => {
    function handlePaste(e: ClipboardEvent) {
      const items = e.clipboardData?.items;
      if (!items || items.length === 0) return;

      let imageFile: File | null = null;
      for (const item of items) {
        if (item.kind === "file" && ACCEPTED_TYPES.includes(item.type)) {
          imageFile = item.getAsFile();
          break;
        }
      }

      if (!imageFile) return;
      e.preventDefault();

      if (imageFile.size > MAX_SIZE_BYTES) {
        setError("That image is over 15MB — try a smaller screenshot.");
        return;
      }
      setError(null);
      onFile(imageFile);
    }

    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [onFile]);

  return (
    <div>
      <Card
        {...getRootProps()}
        className="relative cursor-pointer overflow-hidden"
        style={{
          borderStyle: "dashed",
          borderWidth: 1.5,
          borderColor: error ? "var(--amber-border)" : isDragActive ? "var(--red-border)" : "var(--hairline-strong)",
          background: isDragActive ? "rgba(255,59,78,0.06)" : "var(--surface)",
          padding: 0,
          transition: "border-color 160ms ease, background 160ms ease",
        }}
      >
        <input {...getInputProps()} />
        <div className="flex flex-col items-center justify-center px-8 py-14 text-center">
          <div className="font-mono absolute left-[18px] top-[14px] flex items-center gap-1.5 text-[11px]" style={{ color: "var(--muted-dim)" }}>
            <span className="h-2 w-2 rounded-full" style={{ background: "#4a4d55" }} />
            <span className="h-2 w-2 rounded-full" style={{ background: "#4a4d55" }} />
            <span className="h-2 w-2 rounded-full" style={{ background: "#4a4d55" }} />
          </div>

          <div
            className="mb-[22px] flex h-[62px] w-[62px] items-center justify-center rounded-2xl"
            style={{ background: "var(--red-dim)", border: "1px solid var(--red-border)" }}
          >
            <ScanEye size={28} color="var(--red)" strokeWidth={1.75} />
          </div>
          <div className="font-display mb-2 text-[19px] font-semibold">
            {isDragActive ? "Drop it to scan" : "Drop a screenshot to check it"}
          </div>
          <div className="mb-5 text-[14px]" style={{ color: "var(--muted)" }}>
            or click to browse &nbsp;·&nbsp; PNG, JPG, WEBP &nbsp;·&nbsp; up to 15MB
          </div>
          <div className="mb-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5">
            <div className="font-mono flex items-center gap-1.5 text-[11.5px]" style={{ color: "var(--green)" }}>
              <Lock size={12} />
              nothing leaves your browser until you see the risk
            </div>
            <div className="font-mono flex items-center gap-1.5 text-[11.5px]" style={{ color: "var(--muted-dim)" }}>
              <Clipboard size={12} />
              or paste (Ctrl/Cmd+V)
            </div>
          </div>
        </div>
      </Card>
      {error && (
        <div className="font-mono mt-2.5 flex items-center gap-1.5 text-[12px]" style={{ color: "var(--amber)" }}>
          <AlertOctagon size={13} />
          {error}
        </div>
      )}
    </div>
  );
}
