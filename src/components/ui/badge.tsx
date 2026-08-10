import { cn } from "@/lib/utils";

type Tone = "neutral" | "red" | "amber" | "green";

const toneStyles: Record<Tone, React.CSSProperties> = {
  neutral: { color: "var(--muted)", borderColor: "var(--hairline)", background: "rgba(255,255,255,0.02)" },
  red: { color: "var(--red)", borderColor: "var(--red-border)", background: "var(--red-dim)" },
  amber: { color: "var(--amber)", borderColor: "var(--amber-border)", background: "var(--amber-dim)" },
  green: { color: "var(--green)", borderColor: "var(--green-border)", background: "var(--green-dim)" },
};

export function Badge({
  children,
  tone = "neutral",
  className,
}: {
  children: React.ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return (
    <span
      className={cn("font-mono inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] tracking-wide", className)}
      style={toneStyles[tone]}
    >
      {children}
    </span>
  );
}
