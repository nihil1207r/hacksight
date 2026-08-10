"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { Header } from "@/components/Header";
import { Landing } from "@/components/Landing";

// Analysis pulls in Tesseract.js, Framer Motion, and the whole
// attacker-simulation UI — none of it is needed for first paint on the
// landing page, so it's kept out of the initial bundle entirely. This is
// also why the landing <-> analysis transition below is plain CSS rather
// than Framer Motion: pulling the library into page.tsx (which is always
// eagerly loaded) would undo the point of the dynamic import.
const AnalysisScreen = dynamic(
  () => import("@/components/AnalysisScreen").then((m) => m.AnalysisScreen),
  {
    ssr: false,
    loading: () => (
      <div className="mx-auto max-w-[1040px] px-6 pt-11">
        <div className="font-mono text-[12.5px]" style={{ color: "var(--muted)" }}>
          Loading analyzer…
        </div>
      </div>
    ),
  }
);

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [deepScan, setDeepScan] = useState(false);
  const [cloudDeepScan, setCloudDeepScan] = useState(false);

  return (
    <div className="min-h-screen">
      <Header />
      <div key={file ? "analysis" : "landing"} className="animate-fade-in-up">
        {file ? (
          <AnalysisScreen file={file} deepScan={deepScan} cloudDeepScan={cloudDeepScan} onReset={() => setFile(null)} />
        ) : (
          <Landing
            onFile={setFile}
            deepScan={deepScan}
            onDeepScanChange={setDeepScan}
            cloudDeepScan={cloudDeepScan}
            onCloudDeepScanChange={setCloudDeepScan}
          />
        )}
      </div>
    </div>
  );
}
