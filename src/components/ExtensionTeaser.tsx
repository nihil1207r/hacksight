"use client";

import { AppWindow, ShieldCheck, ShieldQuestion, Code2 } from "lucide-react";
import { Card } from "@/components/ui/card";

export function ExtensionTeaser() {
  return (
    <div className="mt-16">
      <div className="mb-[22px] text-center">
        <span
          className="font-mono text-[11.5px] uppercase tracking-[0.12em]"
          style={{ color: "var(--green)" }}
        >
          Available now
        </span>
      </div>

      <Card style={{ padding: 22, maxWidth: 560, margin: "0 auto" }}>
        <div className="mb-4 flex items-center gap-2">
          <AppWindow size={17} color="var(--muted)" />
          <span className="font-display text-[15px] font-semibold">HackSight as a browser extension</span>
        </div>
        <p className="mb-4 text-[13px] leading-relaxed" style={{ color: "var(--muted)" }}>
          Intercepts image uploads on GitHub, Reddit, Discord, Stack Overflow,
          and LinkedIn out of the box — or any site, if you turn on
          &quot;Protect me everywhere&quot; in Settings. Runs this same local
          scan automatically before the upload leaves your browser, and asks
          before anything sensitive goes out.
        </p>

        {/* Illustrative preview of the extension's review popup */}
        <div className="overflow-hidden rounded-xl" style={{ border: "1px solid var(--hairline)" }}>
          <div
            className="flex items-center gap-1.5 px-3 py-2"
            style={{ background: "#14161c", borderBottom: "1px solid var(--hairline)" }}
          >
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: "#4a4d55" }} />
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: "#4a4d55" }} />
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: "#4a4d55" }} />
            <div
              className="font-mono ml-2 flex-1 truncate rounded px-2 py-0.5 text-[10px]"
              style={{ background: "#0d0e12", color: "var(--muted-dim)" }}
            >
              github.com/your-org/repo/issues/new
            </div>
          </div>
          <div className="flex items-center justify-between gap-3 p-4" style={{ background: "#0d0e12" }}>
            <div className="flex items-center gap-2">
              <Code2 size={16} color="var(--muted)" />
              <span className="text-[12px]" style={{ color: "var(--muted)" }}>
                Checking screenshot.png for sensitive information…
              </span>
            </div>
            <div
              className="font-mono flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px]"
              style={{ border: "1px solid var(--red-border)", background: "var(--red-dim)", color: "var(--red)" }}
            >
              <ShieldQuestion size={12} />
              Review before upload
            </div>
          </div>
        </div>

        <div className="mt-3 flex items-center justify-center gap-2">
          <div
            className="font-mono flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[10.5px]"
            style={{ border: "1px solid var(--green-border)", background: "var(--green-dim)", color: "var(--green)" }}
          >
            <ShieldCheck size={11} />
            Continue, redact, or cancel — your call, every time
          </div>
        </div>
      </Card>
    </div>
  );
}