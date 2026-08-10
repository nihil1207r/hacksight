"use client";

import { motion } from "framer-motion";
import { Skull, ShieldHalf } from "lucide-react";

export type ViewMode = "attacker" | "defender";

export function ViewTabs({ value, onChange }: { value: ViewMode; onChange: (v: ViewMode) => void }) {
  const options: { key: ViewMode; label: string; icon: typeof Skull }[] = [
    { key: "attacker", label: "Attacker View", icon: Skull },
    { key: "defender", label: "Defender View", icon: ShieldHalf },
  ];

  return (
    <div
      className="relative inline-flex rounded-full p-1"
      style={{ border: "1px solid var(--hairline)", background: "rgba(255,255,255,0.02)" }}
    >
      {options.map(({ key, label, icon: Icon }) => {
        const active = value === key;
        return (
          <button
            key={key}
            onClick={() => onChange(key)}
            className="font-mono relative z-10 flex items-center gap-1.5 rounded-full px-4 py-2 text-[12px]"
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: active ? "#0a0a0a" : "var(--muted)",
              transition: "color 200ms ease",
            }}
          >
            {active && (
              <motion.div
                layoutId="view-tab-pill"
                className="absolute inset-0 rounded-full"
                style={{ background: key === "attacker" ? "var(--red)" : "var(--green)", zIndex: -1 }}
                transition={{ type: "spring", stiffness: 400, damping: 30 }}
              />
            )}
            <Icon size={13} />
            {label}
          </button>
        );
      })}
    </div>
  );
}
