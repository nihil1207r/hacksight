import { Clock, TrendingUp, Gauge, AlertTriangle, Wrench, Link2, Target, Skull } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { impactColorVar } from "@/lib/patterns";
import type { AssetSimulation, ChainSimulation, Likelihood, Difficulty } from "@/lib/simulationTypes";

function likelihoodTone(l: Likelihood): "red" | "amber" | "green" {
  if (l === "high") return "red";
  if (l === "medium") return "amber";
  return "green";
}

function difficultyTone(d: Difficulty): "red" | "amber" | "green" {
  if (d === "trivial") return "red";
  if (d === "moderate") return "amber";
  return "green";
}

function ConfidenceMeter({ confidence, reasons }: { confidence: number; reasons: string[] }) {
  const color = confidence >= 75 ? "var(--green)" : confidence >= 45 ? "var(--amber)" : "var(--muted-dim)";
  return (
    <div className="mb-3 rounded-lg p-2.5" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid var(--hairline)" }}>
      <div className="mb-1.5 flex items-center justify-between">
        <span className="font-mono text-[10.5px] uppercase tracking-[0.08em]" style={{ color: "var(--muted-dim)" }}>
          Assessment confidence
        </span>
        <span className="font-mono text-[11px] font-medium" style={{ color }}>
          {confidence}%
        </span>
      </div>
      <div className="mb-2 h-1.5 w-full overflow-hidden rounded-full" style={{ background: "var(--hairline)" }}>
        <div className="h-full rounded-full" style={{ width: `${confidence}%`, background: color }} />
      </div>
      {reasons.length > 0 && (
        <ul className="flex flex-col gap-0.5 pl-3.5 text-[11px]" style={{ color: "var(--muted)", listStyle: "disc" }}>
          {reasons.map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function AttackCard({
  title,
  icon,
  sim,
  isChain,
  hideImpact,
}: {
  title: string;
  icon?: React.ReactNode;
  sim: AssetSimulation | ChainSimulation;
  isChain?: boolean;
  hideImpact?: boolean;
}) {
  return (
    <div
      className="rounded-xl p-4"
      style={{
        border: `1px solid ${isChain ? "var(--red-border)" : "var(--hairline)"}`,
        background: isChain ? "var(--red-dim)" : "rgba(255,255,255,0.015)",
      }}
    >
      <div className="mb-2.5 flex items-center gap-2">
        {isChain ? <Link2 size={15} color="var(--red)" /> : icon}
        <span className="font-display text-[14px] font-semibold">{title}</span>
      </div>

      <p className="mb-3 text-[13px] leading-relaxed" style={{ color: "var(--text)" }}>
        {sim.summary}
      </p>

      <div className="mb-3 flex flex-wrap gap-1.5">
        <Badge tone={likelihoodTone(sim.likelihood)}>
          <TrendingUp size={11} /> {sim.likelihood} likelihood
        </Badge>
        <Badge tone={difficultyTone(sim.difficulty)}>
          <Gauge size={11} /> {sim.difficulty}
        </Badge>
        <Badge tone="neutral">
          <Clock size={11} /> {sim.timeToExploit}
        </Badge>
        <Badge tone={sim.attackSuccessProbability >= 60 ? "red" : sim.attackSuccessProbability >= 30 ? "amber" : "green"}>
          <Target size={11} /> {sim.attackSuccessProbability}% success odds
        </Badge>
      </div>

      {sim.steps.length > 0 && (
        <div className="mb-3">
          <div className="font-mono mb-1.5 text-[10.5px] uppercase tracking-[0.08em]" style={{ color: "var(--muted-dim)" }}>
            Attack steps
          </div>
          <ol className="flex flex-col gap-1.5">
            {sim.steps.map((s, i) => (
              <li key={i} className="flex items-start gap-2 text-[12.5px]">
                <span
                  className="font-mono mt-[1px] flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full text-[9px]"
                  style={{ background: impactColorVar(s.risk), color: "#0a0a0a" }}
                >
                  {i + 1}
                </span>
                <span style={{ color: "var(--text)" }}>
                  <span className="font-display font-semibold">{s.name}</span>
                  {" — "}
                  <span style={{ color: "var(--muted)" }}>{s.description}</span>
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}

      <div className="mb-3 flex items-start gap-2 rounded-lg p-2.5" style={{ background: "rgba(255,59,78,0.04)", border: "1px solid var(--hairline)" }}>
        <Skull size={13} color="var(--muted-dim)" style={{ flexShrink: 0, marginTop: 1 }} />
        <div>
          <span className="font-mono text-[10.5px] uppercase tracking-[0.08em]" style={{ color: "var(--muted-dim)" }}>
            Estimated damage
          </span>
          <p className="mt-0.5 text-[12px] leading-relaxed" style={{ color: "var(--text)" }}>
            {sim.estimatedDamage}
          </p>
        </div>
      </div>

      <ConfidenceMeter confidence={sim.confidence} reasons={sim.confidenceReasons} />

      {!hideImpact && (
        <div className="mb-3 rounded-lg p-2.5" style={{ background: "rgba(255,176,32,0.06)", border: "1px solid var(--amber-border)" }}>
          <div className="mb-1 flex items-center gap-1.5">
            <AlertTriangle size={12} color="var(--amber)" />
            <span className="font-mono text-[10.5px] uppercase tracking-[0.08em]" style={{ color: "var(--amber)" }}>
              Business impact
            </span>
          </div>
          <p className="text-[12.5px] leading-relaxed" style={{ color: "var(--text)" }}>
            {sim.businessImpact}
          </p>
        </div>
      )}

      {!hideImpact && sim.recommendations.length > 0 && (
        <div>
          <div className="mb-1.5 flex items-center gap-1.5">
            <Wrench size={12} color="var(--green)" />
            <span className="font-mono text-[10.5px] uppercase tracking-[0.08em]" style={{ color: "var(--green)" }}>
              Recommended action
            </span>
          </div>
          <ul className="flex flex-col gap-1 pl-4 text-[12.5px]" style={{ color: "var(--text)", listStyle: "disc" }}>
            {sim.recommendations.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
