import { useState } from "react";
import { ShieldAlert, Lock, Terminal, ArrowRight, KeyRound, Mail, Database, FlaskConical, Loader2 } from "lucide-react";
import { Dropzone } from "@/components/Dropzone";
import { DeepScanToggle } from "@/components/DeepScanToggle";
import { Card } from "@/components/ui/card";
import { ExtensionTeaser } from "@/components/ExtensionTeaser";

const SAMPLE_IMAGE_URL = "/sample/leaked-staging-env.png";
const SAMPLE_IMAGE_NAME = "leaked-staging-env.png";

const PIPELINE: { label: string; zone: "local" | "cloud" }[] = [
  { label: "Upload Screenshot", zone: "local" },
  { label: "Pre-Share Scan", zone: "local" },
  { label: "Attacker Simulation", zone: "cloud" },
  { label: "Leak Chain", zone: "cloud" },
  { label: "Business Impact", zone: "cloud" },
  { label: "Safe Screenshot", zone: "local" },
  { label: "Ready to Share", zone: "local" },
];

const NEVER_LEAVES = [
  { icon: KeyRound, label: "API keys & tokens" },
  { icon: Lock, label: "Passwords" },
  { icon: Mail, label: "Email addresses" },
  { icon: Database, label: "Raw screenshots" },
];

const FEATURES = [
  {
    icon: ShieldAlert,
    color: "var(--red)",
    title: "Real local detection",
    body: "Tesseract OCR plus a regex pattern library for AWS keys, OpenAI keys, GitHub tokens, JWTs, database URLs, and more — all in your browser.",
  },
  {
    icon: Lock,
    color: "var(--green)",
    title: "Private by architecture",
    body: "OCR and secret detection run entirely client-side. Only anonymized metadata — never the secret itself — is sent to Gemini for the attack simulation.",
  },
  {
    icon: Terminal,
    color: "var(--text)",
    title: "One question, answered",
    body: "No dashboard. No login. You upload a screenshot and get one answer: is this safe to share?",
  },
];

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="font-mono mb-[18px] inline-flex items-center gap-2 text-[12px] uppercase tracking-[0.14em]"
      style={{ color: "var(--red)" }}
    >
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ background: "var(--red)", boxShadow: "0 0 8px var(--red)" }}
      />
      {children}
    </div>
  );
}

export function Landing({
  onFile,
  deepScan,
  onDeepScanChange,
  cloudDeepScan,
  onCloudDeepScanChange,
}: {
  onFile: (file: File) => void;
  deepScan: boolean;
  onDeepScanChange: (v: boolean) => void;
  cloudDeepScan: boolean;
  onCloudDeepScanChange: (v: boolean) => void;
}) {
  const [loadingSample, setLoadingSample] = useState(false);
  const [sampleError, setSampleError] = useState<string | null>(null);

  async function useSample() {
    setSampleError(null);
    setLoadingSample(true);
    try {
      const res = await fetch(SAMPLE_IMAGE_URL);
      if (!res.ok) throw new Error(`Sample image request failed (${res.status}).`);
      const blob = await res.blob();
      const file = new File([blob], SAMPLE_IMAGE_NAME, { type: blob.type || "image/png" });
      onFile(file);
    } catch {
      setSampleError("Couldn't load the sample screenshot — try dropping your own instead.");
      setLoadingSample(false);
    }
  }

  return (
    <div className="mx-auto max-w-[880px] px-6 pb-[100px] pt-[76px]">
      <div className="mb-11 text-center">
        <div className="flex justify-center">
          <Eyebrow>The security checkpoint before you share</Eyebrow>
        </div>
        <h1
          className="font-display animate-fade-in-up mb-[14px]"
          style={{
            fontSize: "clamp(38px, 6vw, 60px)",
            fontWeight: 700,
            lineHeight: 1.06,
            letterSpacing: "-0.02em",
          }}
        >
          Is this <span style={{ color: "var(--red)" }}>safe to share?</span>
        </h1>
        <p className="mx-auto mb-2 max-w-[560px] text-[16.5px] leading-relaxed" style={{ color: "var(--muted)" }}>
          HackSight doesn&apos;t just tell you what&apos;s visible in a
          screenshot — it tells you exactly how an attacker would exploit
          it, then hands you back a safe version. Before you post it to
          GitHub, Reddit, LinkedIn, or anywhere else.
        </p>
      </div>

      <div className="animate-scale-in" style={{ animationDelay: "0.1s" }}>
        <Dropzone onFile={onFile} />

        <div className="mt-3 flex flex-col items-center gap-1.5">
          <button
            onClick={useSample}
            disabled={loadingSample}
            className="font-mono flex items-center gap-1.5 text-[12.5px]"
            style={{
              color: "var(--red)",
              background: "none",
              border: "none",
              cursor: loadingSample ? "default" : "pointer",
              opacity: loadingSample ? 0.7 : 1,
            }}
          >
            {loadingSample ? <Loader2 size={13} className="animate-spin" /> : <FlaskConical size={13} />}
            {loadingSample ? "Loading sample…" : "Try a sample — no upload needed"}
          </button>
          <div className="text-[11.5px]" style={{ color: "var(--muted-dim)" }}>
            A staged Slack screenshot loaded with an AWS key, a Slack webhook, and a DB URL — see the combined attack chain.
          </div>
          {sampleError && (
            <div className="font-mono text-[11.5px]" style={{ color: "var(--amber)" }}>
              {sampleError}
            </div>
          )}
        </div>

        <DeepScanToggle
          checked={deepScan}
          onChange={onDeepScanChange}
          cloudChecked={cloudDeepScan}
          onCloudChange={onCloudDeepScanChange}
        />
      </div>

      <div className="mt-16">
        <div className="mb-[22px] text-center">
          <span
            className="font-mono text-[11.5px] uppercase tracking-[0.12em]"
            style={{ color: "var(--muted-dim)" }}
          >
            How a screenshot moves through HackSight
          </span>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2.5">
          {PIPELINE.map((step, i) => (
            <div key={step.label} className="flex items-center gap-2.5">
              <div
                className="font-mono whitespace-nowrap rounded-full px-3.5 py-2 text-[11.5px]"
                style={{
                  border: `1px solid ${step.zone === "cloud" ? "var(--red-border)" : "var(--hairline)"}`,
                  color: step.zone === "cloud" ? "var(--red)" : "var(--text)",
                  background: step.zone === "cloud" ? "var(--red-dim)" : "rgba(255,255,255,0.02)",
                }}
              >
                {step.label}
              </div>
              {i < PIPELINE.length - 1 && <ArrowRight size={13} color="var(--muted-dim)" />}
            </div>
          ))}
        </div>
      </div>

      <div className="mt-[72px] grid gap-3.5" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))" }}>
        {FEATURES.map(({ icon: Icon, color, title, body }, i) => (
          <div key={title} className="animate-fade-in-up" style={{ animationDelay: `${i * 0.08}s` }}>
            <Card style={{ padding: 22, height: "100%" }}>
              <Icon size={18} color={color} style={{ marginBottom: 12 }} />
              <div className="font-display mb-1.5 text-[15px] font-semibold">{title}</div>
              <div className="text-[13.5px] leading-relaxed" style={{ color: "var(--muted)" }}>
                {body}
              </div>
            </Card>
          </div>
        ))}
      </div>

      <div className="mt-16">
        <div className="mb-[22px] text-center">
          <span
            className="font-mono text-[11.5px] uppercase tracking-[0.12em]"
            style={{ color: "var(--muted-dim)" }}
          >
            Gemini never sees
          </span>
        </div>
        <div className="flex flex-wrap justify-center gap-2.5">
          {NEVER_LEAVES.map(({ icon: Icon, label }) => (
            <div
              key={label}
              className="font-mono flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[12px]"
              style={{ color: "var(--muted)", border: "1px solid var(--hairline)" }}
            >
              <Icon size={13} color="var(--muted-dim)" />
              {label}
            </div>
          ))}
        </div>
      </div>

      <ExtensionTeaser />
    </div>
  );
}
