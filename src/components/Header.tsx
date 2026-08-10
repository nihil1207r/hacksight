import { ScanEye, Lock } from "lucide-react";

export function Header() {
  return (
    <header
      className="flex flex-wrap items-center justify-between gap-3 px-8 py-5"
      style={{ borderBottom: "1px solid var(--hairline)" }}
    >
      <div className="flex items-center gap-2.5">
        <div
          className="flex h-[30px] w-[30px] items-center justify-center rounded-lg"
          style={{ background: "var(--red-dim)", border: "1px solid var(--red-border)" }}
        >
          <ScanEye size={16} color="var(--red)" strokeWidth={2.25} />
        </div>
        <span className="font-display text-[16px] font-semibold tracking-tight">
          HackSight <span style={{ color: "var(--red)" }}>AI</span>
        </span>
      </div>
      <div
        className="font-mono flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11.5px]"
        style={{ color: "var(--muted)", border: "1px solid var(--hairline)" }}
      >
        <Lock size={12} color="var(--green)" />
        100% local scanning
      </div>
    </header>
  );
}
