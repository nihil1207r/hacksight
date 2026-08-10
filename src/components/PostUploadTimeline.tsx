"use client";

import { motion } from "framer-motion";
import { Upload, Bot, Database, UserX, Flame } from "lucide-react";

const STAGES = [
  { icon: Upload, label: "Screenshot Uploaded", desc: "The moment it goes live." },
  { icon: Bot, label: "Bots Discover Image", desc: "Automated scrapers index public posts continuously, often within minutes." },
  { icon: Database, label: "Credentials Indexed", desc: "Exposed values get cataloged — screenshots are re-OCR'd by scanners just like this one." },
  { icon: UserX, label: "Attacker Uses Credentials", desc: "Whoever finds it first tries it, whether that's in an hour or next month." },
  { icon: Flame, label: "Damage Begins", desc: "Impact depends entirely on what was exposed and where it was posted." },
];

export function PostUploadTimeline() {
  return (
    <div>
      <div className="font-mono mb-1 text-[10.5px] uppercase tracking-[0.08em]" style={{ color: "var(--muted-dim)" }}>
        What happens after you post this
      </div>
      <p className="mb-4 text-[12.5px]" style={{ color: "var(--muted)" }}>
        A general pattern, not a prediction for this specific screenshot — how fast it moves depends on the destination and what&apos;s exposed.
      </p>

      <div className="relative overflow-x-auto">
        <div className="flex min-w-[560px] items-start gap-0 sm:min-w-0">
          {STAGES.map((s, i) => (
            <div key={s.label} className="flex flex-1 items-start">
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-40px" }}
                transition={{ duration: 0.35, delay: i * 0.12, ease: "easeOut" }}
                className="flex flex-1 flex-col items-center gap-2 text-center"
              >
                <div
                  className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full"
                  style={{ border: "1px solid var(--red-border)", background: "var(--red-dim)" }}
                >
                  <s.icon size={16} color="var(--red)" />
                </div>
                <span className="font-display text-[12px] font-semibold" style={{ maxWidth: 110 }}>
                  {s.label}
                </span>
                <span className="text-[11px] leading-snug" style={{ color: "var(--muted-dim)", maxWidth: 130 }}>
                  {s.desc}
                </span>
              </motion.div>
              {i < STAGES.length - 1 && (
                <div className="mt-[18px] h-[1.5px] flex-1" style={{ background: "var(--hairline)", minWidth: 20 }} />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
