"use client";

import { motion } from "framer-motion";
import { ArrowRight, ArrowDown } from "lucide-react";
import { impactColorVar } from "@/lib/patterns";
import type { AttackStepNode } from "@/lib/simulationTypes";

export function LeakChain({ title, steps }: { title: string; steps: AttackStepNode[] }) {
  if (steps.length === 0) return null;

  return (
    <div>
      <div
        className="font-mono mb-3 text-[10.5px] uppercase tracking-[0.08em]"
        style={{ color: "var(--muted-dim)" }}
      >
        {title}
      </div>

      {/* Horizontal on wide screens, stacked on narrow — handled via CSS below */}
      <div className="leak-chain-row flex flex-wrap items-stretch gap-0">
        {steps.map((step, i) => {
          const color = impactColorVar(step.risk);
          return (
            <div key={i} className="leak-chain-item flex items-center">
              <motion.div
                initial={{ opacity: 0, scale: 0.85, y: 8 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{ duration: 0.35, delay: i * 0.15, ease: "easeOut" }}
                className="flex min-w-[150px] max-w-[200px] flex-col gap-1.5 rounded-xl p-3"
                style={{
                  border: `1px solid ${color}55`,
                  background: `${color}14`,
                }}
              >
                <div className="flex items-center justify-between gap-1.5">
                  <span
                    className="font-mono flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full text-[10px] font-medium"
                    style={{ background: color, color: "#0a0a0a" }}
                  >
                    {i + 1}
                  </span>
                  <span
                    className="font-mono text-[8.5px] uppercase tracking-[0.05em]"
                    style={{ color }}
                  >
                    {step.risk}
                  </span>
                </div>
                <div className="font-display text-[12.5px] font-semibold leading-snug" style={{ color: "var(--text)" }}>
                  {step.name}
                </div>
                <div className="text-[11px] leading-snug" style={{ color: "var(--muted)" }}>
                  {step.description}
                </div>
              </motion.div>

              {i < steps.length - 1 && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.3, delay: i * 0.15 + 0.1 }}
                  className="leak-chain-arrow flex flex-shrink-0 items-center justify-center"
                  style={{ color: "var(--muted-dim)", width: 28 }}
                >
                  <ArrowRight size={16} className="leak-chain-arrow-h" />
                  <ArrowDown size={16} className="leak-chain-arrow-v" />
                </motion.div>
              )}
            </div>
          );
        })}
      </div>

      <style>{`
        .leak-chain-arrow-v { display: none; }
        @media (max-width: 640px) {
          .leak-chain-row { flex-direction: column; }
          .leak-chain-item { flex-direction: column; align-items: flex-start; }
          .leak-chain-arrow { width: 100% !important; height: 20px; padding-left: 10px; }
          .leak-chain-arrow-h { display: none; }
          .leak-chain-arrow-v { display: block; }
        }
      `}</style>
    </div>
  );
}
