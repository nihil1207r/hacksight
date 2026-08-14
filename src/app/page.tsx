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

// Same reasoning as AnalysisScreen above: this pulls in tesseract.js via
// quickScan -> ocr.ts. Without the dynamic import here too, that dependency
// chain gets bundled back into the eagerly-loaded landing page regardless
// of AnalysisScreen being split out, since page.tsx would still statically
// import it as one of its own dependencies.
const BatchResultsScreen = dynamic(
  () => import("@/components/BatchResultsScreen").then((m) => m.BatchResultsScreen),
  {
    ssr: false,
    loading: () => (
      <div className="mx-auto max-w-[1040px] px-6 pt-11">
        <div className="font-mono text-[12.5px]" style={{ color: "var(--muted)" }}>
          Loading…
        </div>
      </div>
    ),
  }
);

export default function Home() {
  // A single upload skips straight to AnalysisScreen, exactly as before —
  // the elaborate single-image narrative (attack-chain simulation,
  // business-impact scoring, staged reveal) is a deliberately paced,
  // one-image-at-a-time experience, not something that scales to running N
  // times concurrently. Multiple uploads go through BatchResultsScreen
  // first: every image is scanned for sensitive info concurrently (cheap,
  // local, no per-image cost), and clicking one opens that exact same
  // AnalysisScreen for just that image.
  const [files, setFiles] = useState<File[] | null>(null);
  const [openFile, setOpenFile] = useState<File | null>(null);
  const [deepScan, setDeepScan] = useState(false);
  const [cloudDeepScan, setCloudDeepScan] = useState(false);

  function reset() {
    setFiles(null);
    setOpenFile(null);
  }

  function handleFiles(selected: File[]) {
    if (selected.length === 1) {
      setOpenFile(selected[0]);
      setFiles(selected);
      return;
    }
    setFiles(selected);
    setOpenFile(null);
  }

  const view = openFile ? "analysis" : files ? "batch" : "landing";

  return (
    <div className="min-h-screen">
      <Header />
      <div key={view} className="animate-fade-in-up">
        {view === "analysis" && openFile && (
          <AnalysisScreen
            file={openFile}
            deepScan={deepScan}
            cloudDeepScan={cloudDeepScan}
            onReset={() => (files && files.length > 1 ? setOpenFile(null) : reset())}
            resetLabel={files && files.length > 1 ? "back to results" : "scan another screenshot"}
          />
        )}
        {view === "batch" && files && (
          <BatchResultsScreen files={files} deepScan={deepScan} cloudDeepScan={cloudDeepScan} onOpenAnalysis={setOpenFile} onReset={reset} />
        )}
        {view === "landing" && (
          <Landing
            onFiles={handleFiles}
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