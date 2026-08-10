"use client";

import { useEffect } from "react";
import { AlertOctagon, RefreshCcw } from "lucide-react";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <div
        className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl"
        style={{ background: "var(--red-dim)", border: "1px solid var(--red-border)" }}
      >
        <AlertOctagon size={26} color="var(--red)" />
      </div>
      <h1 className="font-display mb-2 text-[20px] font-semibold">Something broke on our end</h1>
      <p className="mb-6 max-w-[380px] text-[14px] leading-relaxed" style={{ color: "var(--muted)" }}>
        Your screenshot never left your browser, so nothing was exposed — this
        was just an app error. Try again.
      </p>
      <button
        onClick={reset}
        className="font-mono flex items-center gap-2 rounded-full px-4 py-2.5 text-[12.5px] font-medium"
        style={{ background: "var(--red)", color: "#0a0a0a", border: "none", cursor: "pointer" }}
      >
        <RefreshCcw size={14} />
        Try again
      </button>
    </div>
  );
}
