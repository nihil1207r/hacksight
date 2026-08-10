"use client";

import { Code2, Briefcase, MessageSquare, MessagesSquare, HelpCircle, Mail, Globe, MoreHorizontal, ArrowRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { DESTINATIONS, DestinationId } from "@/lib/destinations";
import { impactColorVar } from "@/lib/patterns";

const ICONS: Record<DestinationId, typeof Code2> = {
  github: Code2,
  linkedin: Briefcase,
  reddit: MessageSquare,
  discord: MessagesSquare,
  stackoverflow: HelpCircle,
  email: Mail,
  public_website: Globe,
  other: MoreHorizontal,
};

function riskColor(risk: "low" | "medium" | "high" | "critical") {
  return impactColorVar(risk);
}

export function ShareDestinationPicker({ onPick }: { onPick: (id: DestinationId) => void }) {
  return (
    <Card className="animate-fade-in-up" style={{ padding: 22 }}>
      <div className="mb-1 flex items-center gap-2">
        <ArrowRight size={15} color="var(--red)" />
        <span className="font-display text-[15px] font-semibold">Where are you planning to share this?</span>
      </div>
      <p className="mb-4 text-[13px]" style={{ color: "var(--muted)" }}>
        The destination changes how exploitable this is — a GitHub repo and a
        one-on-one email are very different risks. This is used for the
        attacker simulation only, nothing is sent anywhere yet.
      </p>
      <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))" }}>
        {DESTINATIONS.map((d) => {
          const Icon = ICONS[d.id];
          const color = riskColor(d.risk);
          return (
            <button
              key={d.id}
              onClick={() => onPick(d.id)}
              className="flex flex-col items-start gap-1.5 rounded-xl p-3 text-left"
              style={{
                border: "1px solid var(--hairline)",
                background: "rgba(255,255,255,0.015)",
                cursor: "pointer",
              }}
            >
              <div className="flex w-full items-center justify-between">
                <Icon size={16} color="var(--text)" />
                <span className="font-mono" style={{ fontSize: 9.5, color, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  {d.risk}
                </span>
              </div>
              <span className="font-display text-[13px] font-semibold">{d.label}</span>
              <span className="text-[11px] leading-snug" style={{ color: "var(--muted-dim)" }}>
                {d.tagline}
              </span>
            </button>
          );
        })}
      </div>
    </Card>
  );
}
