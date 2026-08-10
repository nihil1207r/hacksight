"use client";

import { useEffect, useState } from "react";
import { motion, animate } from "framer-motion";
import { ShieldCheck, ShieldAlert, ShieldQuestion, ShieldX } from "lucide-react";

type SafeBand = "safe" | "mostly_safe" | "caution" | "unsafe";

function bandFor(safePercent: number): SafeBand {
  if (safePercent >= 90) return "safe";
  if (safePercent >= 70) return "mostly_safe";
  if (safePercent >= 40) return "caution";
  return "unsafe";
}

const VERDICT: Record<SafeBand, { label: string; sub: string; icon: typeof ShieldCheck; color: string }> = {
  safe: { label: "Safe to Post", sub: "No meaningful exposure found.", icon: ShieldCheck, color: "var(--green)" },
  mostly_safe: {
    label: "Mostly Safe",
    sub: "Low-severity findings only — a final look wouldn't hurt.",
    icon: ShieldQuestion,
    color: "var(--amber)",
  },
  caution: {
    label: "Think Again",
    sub: "Something here is worth fixing before you post it.",
    icon: ShieldAlert,
    color: "var(--orange)",
  },
  unsafe: { label: "Do Not Share", sub: "A real attacker could act on this.", icon: ShieldX, color: "var(--red)" },
};

export function SafeToShareHero({
  score,
  findingCount,
}: {
  /** 0-100 risk score, higher = worse (from lib/detectSecrets). Inverted here into a "safe %". */
  score: number;
  band?: "low" | "medium" | "critical";
  findingCount: number;
}) {
  const safePercent = Math.max(0, Math.min(100, 100 - score));
  const [displayPercent, setDisplayPercent] = useState(0);
  const verdict = VERDICT[bandFor(safePercent)];
  const color = verdict.color;
  const circumference = 2 * Math.PI * 46;

  useEffect(() => {
    const controls = animate(0, safePercent, {
      duration: 0.9,
      ease: "easeOut",
      onUpdate: (v) => setDisplayPercent(Math.round(v)),
    });
    return () => controls.stop();
  }, [safePercent]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: "easeOut" }}
      className="flex flex-col items-center gap-4 rounded-2xl p-5 text-center sm:flex-row sm:items-center sm:gap-5 sm:text-left"
      style={{ border: `1px solid ${color}55`, background: `${color}0f` }}
    >
      <div style={{ position: "relative", width: 100, height: 100, flexShrink: 0 }}>
        <svg width="100" height="100" viewBox="0 0 100 100" style={{ transform: "rotate(-90deg)" }}>
          <circle cx="50" cy="50" r="46" fill="none" stroke="var(--hairline)" strokeWidth="7" />
          <motion.circle
            cx="50"
            cy="50"
            r="46"
            fill="none"
            stroke={color}
            strokeWidth="7"
            strokeLinecap="round"
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset: circumference - (safePercent / 100) * circumference }}
            transition={{ duration: 0.9, ease: "easeOut" }}
          />
        </svg>
        <div
          className="font-display"
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <span style={{ fontSize: 26, fontWeight: 700, lineHeight: 1 }}>{displayPercent}%</span>
          <span className="font-mono" style={{ fontSize: 9, color: "var(--muted-dim)", marginTop: 2 }}>
            SAFE TO SHARE
          </span>
        </div>
      </div>

      <div>
        <div className="mb-1 flex items-center justify-center gap-2 sm:justify-start">
          <verdict.icon size={20} color={color} />
          <span className="font-display" style={{ fontSize: 19, fontWeight: 700, color }}>
            {verdict.label}
          </span>
        </div>
        <div className="mb-1.5 text-[13.5px]" style={{ color: "var(--muted)" }}>
          {verdict.sub}
        </div>
        <div className="font-mono text-[11px]" style={{ color: "var(--muted-dim)" }}>
          {findingCount} asset{findingCount === 1 ? "" : "s"} detected · {safePercent}% safe to share
        </div>
      </div>
    </motion.div>
  );
}
