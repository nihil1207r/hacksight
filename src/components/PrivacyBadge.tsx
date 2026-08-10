"use client";

import { motion } from "framer-motion";
import { Cpu, ImageOff, KeyRound, SendHorizontal, CheckCircle2 } from "lucide-react";

const POINTS = [
  { icon: Cpu, label: "Local processing" },
  { icon: ImageOff, label: "No screenshot uploaded" },
  { icon: KeyRound, label: "Secrets never leave device" },
  { icon: SendHorizontal, label: "Only metadata sent" },
];

export function PrivacyBadge() {
  return (
    <div
      className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl px-4 py-3"
      style={{ border: "1px solid var(--green-border)", background: "var(--green-dim)" }}
    >
      {POINTS.map((p, i) => (
        <motion.div
          key={p.label}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.08, duration: 0.3 }}
          className="flex items-center gap-1.5"
        >
          <CheckCircle2 size={13} color="var(--green)" />
          <p.icon size={13} color="var(--green)" />
          <span className="font-mono text-[11px]" style={{ color: "var(--text)" }}>
            {p.label}
          </span>
        </motion.div>
      ))}
    </div>
  );
}
