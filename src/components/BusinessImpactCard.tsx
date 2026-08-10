"use client";

import { motion } from "framer-motion";
import { Building2, DollarSign, Clock3, Users, Scale, Megaphone } from "lucide-react";
import { impactColorVar, bandColorVar } from "@/lib/patterns";
import type { BusinessImpactBreakdown as Breakdown } from "@/lib/simulationTypes";

const CATEGORIES: { key: keyof Breakdown; label: string; icon: typeof DollarSign }[] = [
  { key: "financialLoss", label: "Financial Loss", icon: DollarSign },
  { key: "operationalDowntime", label: "Downtime", icon: Clock3 },
  { key: "customerImpact", label: "Customer Impact", icon: Users },
  { key: "complianceRisk", label: "Compliance Risk", icon: Scale },
  { key: "reputationDamage", label: "Reputation", icon: Megaphone },
];

export function BusinessImpactCard({
  label,
  impact,
  breakdown,
  severity,
  index,
}: {
  label: string;
  impact: string;
  breakdown: Breakdown;
  severity: number;
  index: number;
}) {
  const band = severity >= 7 ? "critical" : severity >= 4 ? "medium" : "low";
  const color = bandColorVar(band);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: index * 0.08, ease: "easeOut" }}
      className="rounded-xl p-4"
      style={{ border: `1px solid ${color}40`, background: "rgba(255,255,255,0.015)" }}
    >
      <div className="mb-2 flex items-center gap-2">
        <Building2 size={15} color={color} />
        <span className="font-display text-[13.5px] font-semibold">{label}</span>
      </div>
      <p className="mb-3 text-[13px] leading-relaxed" style={{ color: "var(--muted)" }}>
        {impact}
      </p>

      <div className="flex flex-col gap-1.5">
        {CATEGORIES.map(({ key, label: catLabel, icon: Icon }, i) => {
          const level = breakdown[key];
          const catColor = impactColorVar(level);
          return (
            <motion.div
              key={key}
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.08 + i * 0.04 + 0.1 }}
              className="flex items-center gap-2"
            >
              <Icon size={12} color="var(--muted-dim)" style={{ flexShrink: 0 }} />
              <span className="flex-1 text-[11px]" style={{ color: "var(--muted)" }}>
                {catLabel}
              </span>
              <span
                className="font-mono rounded-full px-2 py-0.5 text-[9.5px] uppercase tracking-[0.04em]"
                style={{ color: catColor, background: `${catColor}18`, border: `1px solid ${catColor}40` }}
              >
                {level}
              </span>
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
}
