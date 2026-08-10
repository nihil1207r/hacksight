"use client";

import { useEffect, useState } from "react";
import { Sparkles, Loader2, Cloud } from "lucide-react";

/**
 * Deep Scan now defaults to the on-device NER pass (localSemanticScan.ts):
 * runs entirely in the browser via a local model, so it's available
 * unconditionally — no server key, no OCR text ever leaving the device.
 *
 * The old cloud pass (semanticScan.ts, Option B) is still here as a
 * clearly-separate, off-by-default opt-in for when the on-device model
 * misses something — it's the only path in this app where OCR text leaves
 * the browser, so it stays an explicit second decision, not bundled into
 * the primary switch.
 */

type CloudAvailability = "checking" | "available" | "unavailable";

export function DeepScanToggle({
  checked,
  onChange,
  cloudChecked,
  onCloudChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  cloudChecked: boolean;
  onCloudChange: (v: boolean) => void;
}) {
  const [cloudAvailability, setCloudAvailability] = useState<CloudAvailability>("checking");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/semantic-scan")
      .then((r) => (r.ok ? r.json() : { available: false }))
      .then((json) => {
        if (!cancelled) setCloudAvailability(json?.available ? "available" : "unavailable");
      })
      .catch(() => {
        if (!cancelled) setCloudAvailability("unavailable");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div
      className="mt-3 flex flex-col gap-3 rounded-xl px-3.5 py-3"
      style={{ border: "1px solid var(--hairline)", background: "rgba(255,255,255,0.02)" }}
    >
      <div className="flex items-start gap-3">
        <button
          type="button"
          role="switch"
          aria-checked={checked}
          onClick={() => onChange(!checked)}
          className="relative mt-0.5 flex-shrink-0 rounded-full"
          style={{
            width: 34,
            height: 20,
            border: "1px solid var(--hairline-strong)",
            background: checked ? "var(--red)" : "rgba(255,255,255,0.06)",
            cursor: "pointer",
            transition: "background 150ms ease",
          }}
        >
          <span
            className="absolute rounded-full bg-white"
            style={{ width: 14, height: 14, top: 2, left: checked ? 16 : 2, transition: "left 150ms ease" }}
          />
        </button>

        <div className="min-w-0 flex-1 text-left">
          <div className="font-display flex items-center gap-1.5 text-[13px] font-semibold">
            <Sparkles size={13} color="var(--red)" />
            Deep Scan: also catch names & orgs
          </div>
          <div className="mt-1 text-[12px] leading-relaxed" style={{ color: "var(--muted)" }}>
            Runs a small model in your browser to catch names, workplaces, and other unlabeled sensitive info the
            regex patterns can&apos;t. Fully on-device — nothing leaves the browser.
          </div>
        </div>
      </div>

      {checked && (
        <div className="ml-[46px] flex items-start gap-3 border-t pt-3" style={{ borderColor: "var(--hairline)" }}>
          <button
            type="button"
            role="switch"
            aria-checked={cloudChecked && cloudAvailability === "available"}
            disabled={cloudAvailability !== "available"}
            onClick={() => onCloudChange(!cloudChecked)}
            className="relative mt-0.5 flex-shrink-0 rounded-full"
            style={{
              width: 34,
              height: 20,
              border: "1px solid var(--hairline-strong)",
              background: cloudChecked && cloudAvailability === "available" ? "var(--amber)" : "rgba(255,255,255,0.06)",
              cursor: cloudAvailability === "available" ? "pointer" : "not-allowed",
              opacity: cloudAvailability === "available" ? 1 : 0.5,
              transition: "background 150ms ease",
            }}
          >
            <span
              className="absolute rounded-full bg-white"
              style={{
                width: 14,
                height: 14,
                top: 2,
                left: cloudChecked && cloudAvailability === "available" ? 16 : 2,
                transition: "left 150ms ease",
              }}
            />
          </button>

          <div className="min-w-0 flex-1 text-left">
            <div className="font-display flex items-center gap-1.5 text-[12.5px] font-semibold">
              <Cloud size={12} color="var(--amber)" />
              Also run cloud scan for extra coverage
              {cloudAvailability === "checking" && <Loader2 size={11} className="animate-spin" style={{ color: "var(--muted-dim)" }} />}
            </div>
            <div className="mt-1 text-[11.5px] leading-relaxed" style={{ color: "var(--muted)" }}>
              {cloudAvailability === "unavailable"
                ? "Not configured on this server — set OPENROUTER_API_KEY to enable this."
                : "Usually catches more than the on-device model. Trade-off: sends the OCR'd text (not the image) to an external model — off by default."}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
