import Link from "next/link";
import { ScanEye } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <div
        className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl"
        style={{ background: "var(--red-dim)", border: "1px solid var(--red-border)" }}
      >
        <ScanEye size={26} color="var(--red)" />
      </div>
      <h1 className="font-display mb-2 text-[20px] font-semibold">Nothing here to scan</h1>
      <p className="mb-6 max-w-[360px] text-[14px] leading-relaxed" style={{ color: "var(--muted)" }}>
        This page doesn&apos;t exist. HackSight only has one screen — the checkpoint.
      </p>
      <Link
        href="/"
        className="font-mono rounded-full px-4 py-2.5 text-[12.5px] font-medium"
        style={{ background: "var(--red)", color: "#0a0a0a", border: "none" }}
      >
        Back to HackSight
      </Link>
    </div>
  );
}
