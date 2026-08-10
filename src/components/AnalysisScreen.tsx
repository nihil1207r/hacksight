"use client";

import { useEffect, useRef, useState, useCallback, useMemo, type PointerEvent as ReactPointerEvent } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { RefreshCcw, CheckCircle2, Loader2, ImageOff, ChevronDown, AlertOctagon, CheckSquare, Link2, MousePointerClick, ZoomIn, ZoomOut, Search } from "lucide-react";
import { Card } from "@/components/ui/card";
import { SafeToShareHero } from "@/components/SafeToShareHero";
import { FindingCard } from "@/components/FindingCard";
import { AttackCard } from "@/components/AttackCard";
import { LeakChain } from "@/components/LeakChain";
import { TimeToExploitTimeline } from "@/components/TimeToExploitTimeline";
import { PostUploadTimeline } from "@/components/PostUploadTimeline";
import { BusinessImpactCard } from "@/components/BusinessImpactCard";
import { SafeScreenshot } from "@/components/SafeScreenshot";
import { PrivacyBadge } from "@/components/PrivacyBadge";
import { ShareDestinationPicker } from "@/components/ShareDestinationPicker";
import { ViewTabs, ViewMode } from "@/components/ViewTabs";
import { runLocalOcr } from "@/lib/ocr";
import { runLocalSemanticScan, preloadLocalSemanticModel } from "@/lib/localSemanticScan";
import { detectSecrets, scoreFindings, buildFindingsFromSemantic, DetectionResult, Finding } from "@/lib/detectSecrets";
import { toMetadata, AssetMetadata } from "@/lib/metadata";
import { bandColorVar } from "@/lib/patterns";
import { DestinationId, getDestination } from "@/lib/destinations";
import type { SimulationResponse, AttackStepNode } from "@/lib/simulationTypes";

type Phase =
  | "scanning_screenshot"
  | "extracting_metadata"
  | "thinking"
  | "choosing_destination"
  | "building_chain"
  | "calculating_impact"
  | "generating_safe"
  | "done"
  | "error";

const STEP_LABELS: { phase: Phase; label: string }[] = [
  { phase: "scanning_screenshot", label: "Scanning Screenshot" },
  { phase: "extracting_metadata", label: "Extracting Metadata" },
  { phase: "thinking", label: "Thinking Like an Attacker" },
  { phase: "building_chain", label: "Building Attack Chain" },
  { phase: "calculating_impact", label: "Calculating Business Impact" },
  { phase: "generating_safe", label: "Generating Safe Version" },
];
const PHASE_ORDER: Phase[] = [
  "scanning_screenshot",
  "extracting_metadata",
  "thinking",
  "choosing_destination",
  "building_chain",
  "calculating_impact",
  "generating_safe",
  "done",
];

// "Thinking Like an Attacker..." plays while we wait on the one real network
// call (Gemini) that has no granular progress of its own — cycling the copy
// keeps the sequence feeling alive instead of frozen on one line for
// several seconds.
const THINKING_ROTATION = ["Thinking Like an Attacker…", "Weighing likely attack paths…", "Cross-checking against the destination…"];

export function AnalysisScreen({
  file,
  deepScan,
  cloudDeepScan,
  onReset,
}: {
  file: File;
  deepScan: boolean;
  cloudDeepScan: boolean;
  onReset: () => void;
}) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("scanning_screenshot");
  const [ocrPct, setOcrPct] = useState(0);
  const [localScanPct, setLocalScanPct] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [result, setResult] = useState<DetectionResult | null>(null);
  const [metadata, setMetadata] = useState<AssetMetadata[]>([]);
  const [simulation, setSimulation] = useState<SimulationResponse | null>(null);
  const [simError, setSimError] = useState<string | null>(null);
  const [imgNatural, setImgNatural] = useState<{ w: number; h: number } | null>(null);
  const [imgRendered, setImgRendered] = useState<{ w: number; h: number } | null>(null);
  const [metaOpen, setMetaOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [view, setView] = useState<ViewMode>("attacker");
  const [destination, setDestination] = useState<DestinationId | null>(null);
  const [thinkingIdx, setThinkingIdx] = useState(0);
  // Manual redaction: no detector catches everything, so once the automated
  // pass is done, the user can draw boxes over anything it missed. These
  // live in rendered-image (natural) pixel coordinates, same space as
  // Finding.bbox, so they merge cleanly with detected findings downstream.
  const [manualMode, setManualMode] = useState(false);
  const [manualBoxes, setManualBoxes] = useState<{ id: string; x0: number; y0: number; x1: number; y1: number }[]>([]);
  const [draftBox, setDraftBox] = useState<{ startX: number; startY: number; x0: number; y0: number; x1: number; y1: number } | null>(null);
  const manualIdCounter = useRef(0);
  const imgRef = useRef<HTMLImageElement>(null);
  // Manual redaction is hard to do precisely on a screenshot that's been
  // scaled down to fit the panel — small text (usernames, timestamps) is
  // easy to miss and hard to box accurately at 100%. Two aids: a zoom
  // control that renders the image larger (image container scrolls), and a
  // magnifier loupe that shows a magnified crop right at the cursor while
  // the user is placing/dragging a box.
  const ZOOM_LEVELS = [1, 1.5, 2, 3, 4];
  const [zoomIdx, setZoomIdx] = useState(0);
  const zoom = ZOOM_LEVELS[zoomIdx];
  const [magnifierPos, setMagnifierPos] = useState<{ x: number; y: number; clientX: number; clientY: number } | null>(null);
  const imgBoxRef = useRef<HTMLDivElement>(null);

  function getContentPos(e: ReactPointerEvent<HTMLDivElement>) {
    const el = e.currentTarget;
    const rect = el.getBoundingClientRect();
    return {
      x: e.clientX - rect.left + el.scrollLeft,
      y: e.clientY - rect.top + el.scrollTop,
    };
  }
  const destinationPickerRef = useRef<HTMLDivElement>(null);

  // Resolves once the user picks a destination (or skips) — the analysis
  // pipeline below awaits this before calling Gemini.
  const destinationChoiceRef = useRef<((id: DestinationId | null) => void) | null>(null);
  const waitForDestination = useCallback(() => {
    return new Promise<DestinationId | null>((resolve) => {
      destinationChoiceRef.current = resolve;
    });
  }, []);
  const chooseDestination = useCallback((id: DestinationId | null) => {
    setDestination(id);
    destinationChoiceRef.current?.(id);
    destinationChoiceRef.current = null;
  }, []);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const measure = useCallback(() => {
    if (imgRef.current) {
      setImgRendered({ w: imgRef.current.clientWidth, h: imgRef.current.clientHeight });
    }
  }, []);

  useEffect(() => {
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [measure]);

  // Re-measure whenever the zoom level changes, since it resizes the
  // rendered <img> — scaleX/scaleY (and therefore every overlay box) depend
  // on imgRendered staying in sync with the actual layout size.
  useEffect(() => {
    const id = requestAnimationFrame(measure);
    return () => cancelAnimationFrame(id);
  }, [zoom, measure]);

  // Turning manual mode off should leave things in a clean, predictable
  // state rather than stuck zoomed in with a stale magnifier.
  useEffect(() => {
    if (!manualMode) {
      setZoomIdx(0);
      setMagnifierPos(null);
    }
  }, [manualMode]);

  useEffect(() => {
    if (phase !== "building_chain") return;
    const id = setInterval(() => setThinkingIdx((i) => (i + 1) % THINKING_ROTATION.length), 1400);
    return () => clearInterval(id);
  }, [phase]);

  // The destination picker renders above the two-panel view, so if the user
  // scrolled down while OCR/metadata extraction ran, it can appear entirely
  // off-screen with no indication anything needs their input — the pipeline
  // just silently waits. Auto-scroll it into view the moment it appears.
  useEffect(() => {
    if (phase !== "choosing_destination") return;
    const id = setTimeout(() => {
      destinationPickerRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 50);
    return () => clearTimeout(id);
  }, [phase]);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        setPhase("scanning_screenshot");
        // Fire the on-device model preload alongside OCR, not after it — the
        // ~40MB model fetch + WASM compile has no dependency on OCR output,
        // so overlapping it with OCR's several-second recognition pass means
        // the model is often already warm by the time there's text to feed
        // it, instead of paying that cold-start cost serially afterward.
        if (deepScan) preloadLocalSemanticModel();
        const ocrOutput = await runLocalOcr(file, (p) => {
          if (cancelled) return;
          if (p.status === "recognizing text") {
            setOcrPct(Math.round(p.progress * 100));
          }
        });
        if (cancelled) return;
        setImgNatural({ w: ocrOutput.imageWidth, h: ocrOutput.imageHeight });

        setPhase("extracting_metadata");
        await new Promise((r) => setTimeout(r, 100));
        const regexDetection = detectSecrets(ocrOutput.lines);
        if (cancelled) return;

        // Option B / "Deep Scan": optional second pass over the OCR text
        // for sensitive info regex can't catch (names, addresses, etc).
        // On-device NER runs first — private by default, no server
        // dependency. The cloud pass (sends OCR text, not the image, to an
        // external model) is a separate, explicit opt-in layered on top,
        // only attempted if the user turned both switches on.
        let detection: DetectionResult = regexDetection;
        if (deepScan) {
          // Local (on-device WASM inference) and cloud (network round-trip)
          // are independent of each other's output, so kick both off
          // together instead of awaiting the local pass before starting the
          // cloud request — previously these ran back-to-back, so total wait
          // time was local-time + cloud-time even though neither depends on
          // the other. Promise.allSettled means a failure in one (e.g. no
          // WASM support, or the OpenRouter call erroring) never blocks or
          // discards results from the other.
          const localPromise = runLocalSemanticScan(ocrOutput.lines, (p) => {
            if (!cancelled) setLocalScanPct(Math.round(p.progress * 100));
          });

          const cloudPromise = cloudDeepScan
            ? fetch("/api/semantic-scan", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ lines: ocrOutput.lines.map((l) => l.text) }),
              }).then((res) => (res.ok ? res.json() : null))
            : Promise.resolve(null);

          const [localResult, cloudResult] = await Promise.allSettled([localPromise, cloudPromise]);
          if (cancelled) return;

          const semanticFindings: ReturnType<typeof buildFindingsFromSemantic> = [];

          if (localResult.status === "fulfilled") {
            semanticFindings.push(...buildFindingsFromSemantic(ocrOutput.lines, localResult.value, regexDetection.findings.length));
          }
          // localResult.status === "rejected": on-device model failed to load
          // (e.g. no WASM support) — non-fatal, fall through to whatever the
          // cloud pass (or regex-only) produced.

          if (cloudResult.status === "fulfilled" && cloudResult.value) {
            semanticFindings.push(
              ...buildFindingsFromSemantic(ocrOutput.lines, cloudResult.value.findings ?? [], regexDetection.findings.length + semanticFindings.length)
            );
          }
          // cloudResult.status === "rejected" or value null: non-fatal, keep
          // whatever the on-device pass already found.

          if (semanticFindings.length > 0) {
            detection = scoreFindings([...regexDetection.findings, ...semanticFindings], regexDetection.documentEnvironment);
          }
        }
        if (cancelled) return;

        setPhase("thinking");
        await new Promise((r) => setTimeout(r, 100));
        setResult(detection);
        const meta = toMetadata(detection.findings);
        setMetadata(meta);

        if (meta.length === 0) {
          setPhase("done");
          return;
        }

        setPhase("choosing_destination");
        const chosen = await waitForDestination();
        if (cancelled) return;

        setPhase("building_chain");
        try {
          const res = await fetch("/api/simulate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ metadata: meta, destination: chosen }),
          });
          const json = await res.json();
          if (cancelled) return;
          if (!res.ok) {
            setSimError(json?.error ?? `Simulation request failed (${res.status}).`);
          } else {
            setSimulation(json as SimulationResponse);
          }
        } catch (err) {
          if (cancelled) return;
          setSimError(err instanceof Error ? err.message : "Could not reach the simulation endpoint.");
        }
        if (cancelled) return;

        setPhase("calculating_impact");
        await new Promise((r) => setTimeout(r, 150));
        if (cancelled) return;

        setPhase("generating_safe");
        await new Promise((r) => setTimeout(r, 150));
        if (cancelled) return;

        setPhase("done");
      } catch (err) {
        if (cancelled) return;
        setErrorMsg(err instanceof Error ? err.message : "OCR failed on this image.");
        setPhase("error");
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [file, deepScan, cloudDeepScan, waitForDestination]);

  const scaleX = imgNatural && imgRendered ? imgRendered.w / imgNatural.w : 1;
  const scaleY = imgNatural && imgRendered ? imgRendered.h / imgNatural.h : 1;
  const currentStepIndex = PHASE_ORDER.indexOf(phase);
  const done = phase === "done";
  const hasFindings = !!result && result.findings.length > 0;
  const chosenDestination = getDestination(destination);

  // Convert user-drawn boxes into the same Finding shape the detectors
  // produce, so they flow through SafeScreenshot/generateSafeImage
  // unchanged — one redaction pipeline, regardless of where a box came from.
  const manualFindings: Finding[] = useMemo(
    () =>
      manualBoxes.map((b) => ({
        id: b.id,
        type: "manual_redaction",
        label: "Manually Redacted",
        category: "identifier",
        severity: 5,
        rawValue: "",
        maskedValue: "••••••",
        bbox: { x0: b.x0, y0: b.y0, x1: b.x1, y1: b.y1 },
        environment: result?.documentEnvironment ?? "Unknown",
        visibility: "Fully Visible",
      })),
    [manualBoxes, result]
  );
  const exportFindings = useMemo(() => [...(result?.findings ?? []), ...manualFindings], [result, manualFindings]);

  function handleManualPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (!manualMode || !done) return;
    const { x: startX, y: startY } = getContentPos(e);
    setDraftBox({ startX, startY, x0: startX, y0: startY, x1: startX, y1: startY });
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function handleManualPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (!manualMode) return;
    const { x: curX, y: curY } = getContentPos(e);
    setMagnifierPos({ x: curX, y: curY, clientX: e.clientX, clientY: e.clientY });
    if (!draftBox) return;
    setDraftBox((d) =>
      d ? { ...d, x0: Math.min(d.startX, curX), y0: Math.min(d.startY, curY), x1: Math.max(d.startX, curX), y1: Math.max(d.startY, curY) } : d
    );
  }

  function handleManualPointerUp() {
    if (!draftBox) return;
    const w = draftBox.x1 - draftBox.x0;
    const h = draftBox.y1 - draftBox.y0;
    // Ignore accidental clicks/tiny drags — require a deliberate box.
    if (w > 6 && h > 6) {
      manualIdCounter.current += 1;
      setManualBoxes((prev) => [
        ...prev,
        {
          id: `manual_${manualIdCounter.current}`,
          x0: draftBox.x0 / (scaleX || 1),
          y0: draftBox.y0 / (scaleY || 1),
          x1: draftBox.x1 / (scaleX || 1),
          y1: draftBox.y1 / (scaleY || 1),
        },
      ]);
    }
    setDraftBox(null);
  }

  function removeManualBox(id: string) {
    setManualBoxes((prev) => prev.filter((b) => b.id !== id));
  }

  function adjustZoom(dir: 1 | -1) {
    setZoomIdx((i) => Math.min(ZOOM_LEVELS.length - 1, Math.max(0, i + dir)));
  }

  // The magnifier loupe further-magnifies (3x) a crop centered on the
  // cursor. Boxes drawn on the main image (manual, draft, detected
  // findings) need their own copy positioned in the loupe's local pixel
  // space, or they're invisible inside it — the loupe would otherwise show
  // only the raw pixels underneath, hiding exactly what the user is trying
  // to place precisely.
  const MAG = 3;
  const LOUPE_W = 170;
  const LOUPE_H = 130;
  function toLoupeRect(x0: number, y0: number, x1: number, y1: number) {
    if (!magnifierPos) return null;
    return {
      left: (x0 - magnifierPos.x) * MAG + LOUPE_W / 2,
      top: (y0 - magnifierPos.y) * MAG + LOUPE_H / 2,
      width: (x1 - x0) * MAG,
      height: (y1 - y0) * MAG,
    };
  }

  // The leak chain shows the combined attack-chain narrative if Gemini found
  // one; otherwise it falls back to the single highest-severity asset's own
  // steps, so there's always something to visualize when a simulation ran.
  const leakChainSteps = useMemo(() => {
    if (!simulation || !result) return { title: "Leak chain", steps: [] as AttackStepNode[] };
    if (simulation.attackChain?.chainPossible && simulation.attackChain.steps.length > 0) {
      return { title: "Combined leak chain", steps: simulation.attackChain.steps };
    }
    const topFinding = [...result.findings].sort((a, b) => b.severity - a.severity)[0];
    const topSim = topFinding ? simulation.assets.find((a) => a.assetId === topFinding.id) : null;
    if (topFinding && topSim) {
      return { title: `Leak chain — ${topFinding.label}`, steps: topSim.steps };
    }
    return { title: "Leak chain", steps: [] as AttackStepNode[] };
  }, [simulation, result]);

  const timelineEntries = useMemo(() => {
    if (!simulation || !result) return [];
    return result.findings
      .map((f) => {
        const sim = simulation.assets.find((a) => a.assetId === f.id);
        if (!sim) return null;
        return { id: f.id, label: f.label, timeToExploit: sim.timeToExploit, severity: f.severity };
      })
      .filter((e): e is { id: string; label: string; timeToExploit: string; severity: number } => e !== null);
  }, [simulation, result]);

  return (
    <div className="mx-auto max-w-[1040px] px-6 pb-[90px] pt-11">
      <button
        onClick={onReset}
        className="font-mono mb-6 flex items-center gap-1.5 text-[12.5px]"
        style={{ color: "var(--muted)", background: "none", border: "none", cursor: "pointer" }}
      >
        <RefreshCcw size={13} />
        scan another screenshot
      </button>

      {done && result && (
        <div className="mb-5">
          <SafeToShareHero score={result.overallScore} findingCount={result.findings.length} />
        </div>
      )}

      {done && result && (
        <div className="mb-5">
          <PrivacyBadge />
        </div>
      )}

      {phase === "choosing_destination" && (
        <div className="mb-5" ref={destinationPickerRef}>
          <ShareDestinationPicker onPick={chooseDestination} />
          <button
            onClick={() => chooseDestination(null)}
            className="font-mono mt-2 text-[11.5px]"
            style={{ color: "var(--muted-dim)", background: "none", border: "none", cursor: "pointer" }}
          >
            skip — use general risk assessment
          </button>
        </div>
      )}

      {done && result && (
        <div className="mb-5">
          <SafeScreenshot file={file} findings={exportFindings} />
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        {/* Left: image + overlay boxes + step list */}
        <Card style={{ padding: 14, alignSelf: "start" }}>
          {done && result && (
            <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => {
                    setManualMode((m) => !m);
                    setDraftBox(null);
                  }}
                  className="font-mono flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11.5px]"
                  style={{
                    border: `1px solid ${manualMode ? "#7c9eff" : "var(--hairline-strong)"}`,
                    background: manualMode ? "rgba(124,158,255,0.12)" : "none",
                    color: manualMode ? "#7c9eff" : "var(--text)",
                    cursor: "pointer",
                  }}
                >
                  {manualMode ? "Done — click a box to remove it" : "Missed something? Draw a box to blur it"}
                </button>
                {manualMode && (
                  <div
                    className="flex items-center gap-0.5 rounded-full px-1 py-1"
                    style={{ border: "1px solid var(--hairline-strong)" }}
                  >
                    <button
                      onClick={() => adjustZoom(-1)}
                      disabled={zoomIdx === 0}
                      title="Zoom out"
                      className="flex items-center justify-center rounded-full p-1"
                      style={{ background: "none", border: "none", color: "var(--text)", cursor: zoomIdx === 0 ? "not-allowed" : "pointer", opacity: zoomIdx === 0 ? 0.35 : 1 }}
                    >
                      <ZoomOut size={13} />
                    </button>
                    <span className="font-mono text-[11px]" style={{ color: "var(--muted-dim)", minWidth: 34, textAlign: "center" }}>
                      {Math.round(zoom * 100)}%
                    </span>
                    <button
                      onClick={() => adjustZoom(1)}
                      disabled={zoomIdx === ZOOM_LEVELS.length - 1}
                      title="Zoom in — see small text more clearly"
                      className="flex items-center justify-center rounded-full p-1"
                      style={{
                        background: "none",
                        border: "none",
                        color: "var(--text)",
                        cursor: zoomIdx === ZOOM_LEVELS.length - 1 ? "not-allowed" : "pointer",
                        opacity: zoomIdx === ZOOM_LEVELS.length - 1 ? 0.35 : 1,
                      }}
                    >
                      <ZoomIn size={13} />
                    </button>
                  </div>
                )}
              </div>
              {manualBoxes.length > 0 && (
                <button
                  onClick={() => setManualBoxes([])}
                  className="font-mono text-[11px]"
                  style={{ color: "var(--muted-dim)", background: "none", border: "none", cursor: "pointer" }}
                >
                  clear {manualBoxes.length} manual
                </button>
              )}
            </div>
          )}
          {manualMode && (
            <div
              className="font-mono mb-2.5 flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[11px]"
              style={{ color: "var(--muted)", background: "rgba(124,158,255,0.08)", border: "1px solid rgba(124,158,255,0.25)" }}
            >
              <Search size={12} color="#7c9eff" />
              Small text (usernames, timestamps) is easy to miss — zoom in above, or just start dragging to see the magnifier.
            </div>
          )}
          <div
            ref={imgBoxRef}
            className="relative rounded-[10px]"
            style={{
              border: "1px solid var(--hairline)",
              background: "#0d0e12",
              minHeight: 260,
              maxHeight: manualMode && zoom > 1 ? 560 : undefined,
              overflow: manualMode && zoom > 1 ? "auto" : "hidden",
              cursor: manualMode ? "crosshair" : "default",
              touchAction: manualMode ? "none" : "auto",
            }}
            onPointerDown={handleManualPointerDown}
            onPointerMove={handleManualPointerMove}
            onPointerUp={handleManualPointerUp}
            onPointerLeave={() => setMagnifierPos(null)}
          >
            {previewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- blob: URL from a local File, next/image can't optimize this
              <img
                ref={imgRef}
                src={previewUrl}
                alt="Uploaded screenshot preview"
                onLoad={measure}
                style={{
                  width: manualMode ? `${zoom * 100}%` : "100%",
                  maxWidth: manualMode ? "none" : "100%", // Tailwind preflight sets img { max-width: 100% }
                  // globally, which silently caps the zoomed width back down
                  // to the container — override it explicitly while zoomed.
                  display: "block",
                  filter: done ? "none" : "saturate(0.85)",
                }}
              />
            ) : (
              <div className="flex items-center justify-center" style={{ height: 260, color: "var(--muted-dim)" }}>
                <ImageOff size={22} />
              </div>
            )}

            {!done &&
              phase !== "error" && (
                <div
                  className="absolute left-0 right-0"
                  style={{
                    height: 2,
                    background: "linear-gradient(90deg, transparent, var(--red), transparent)",
                    boxShadow: "0 0 16px var(--red)",
                    animation: "scanline 2.1s linear infinite",
                  }}
                />
              )}

            {done &&
              result &&
              result.findings.map((f: Finding) => (
                <button
                  key={f.id}
                  onClick={() => !manualMode && setSelectedId(f.id === selectedId ? null : f.id)}
                  className="finding-box absolute"
                  style={{
                    left: f.bbox.x0 * scaleX,
                    top: f.bbox.y0 * scaleY,
                    width: Math.max(4, (f.bbox.x1 - f.bbox.x0) * scaleX),
                    height: Math.max(4, (f.bbox.y1 - f.bbox.y0) * scaleY),
                    border: `1.5px solid ${bandColorVar(f.severity >= 7 ? "critical" : f.severity >= 4 ? "medium" : "low")}`,
                    background:
                      selectedId === f.id ? "rgba(255,59,78,0.18)" : "rgba(255,59,78,0.06)",
                    borderRadius: 3,
                    cursor: manualMode ? "crosshair" : "pointer",
                    padding: 0,
                    // Let pointer events pass through to the container while
                    // drawing, so a drag that starts on top of a detected
                    // box still creates a manual box instead of only
                    // toggling selection.
                    pointerEvents: manualMode ? "none" : "auto",
                  }}
                  title={f.label}
                />
              ))}

            {done &&
              manualBoxes.map((b) => (
                <button
                  key={b.id}
                  onClick={() => manualMode && removeManualBox(b.id)}
                  className="absolute"
                  style={{
                    left: b.x0 * scaleX,
                    top: b.y0 * scaleY,
                    width: Math.max(4, (b.x1 - b.x0) * scaleX),
                    height: Math.max(4, (b.y1 - b.y0) * scaleY),
                    border: "1.5px solid #7c9eff",
                    background: "rgba(124,158,255,0.16)",
                    borderRadius: 3,
                    cursor: manualMode ? "pointer" : "default",
                    padding: 0,
                    pointerEvents: manualMode ? "auto" : "none",
                  }}
                  title="Manually added — click to remove"
                />
              ))}

            {draftBox && (
              <div
                className="pointer-events-none absolute"
                style={{
                  left: draftBox.x0,
                  top: draftBox.y0,
                  width: draftBox.x1 - draftBox.x0,
                  height: draftBox.y1 - draftBox.y0,
                  border: "1.5px dashed #7c9eff",
                  background: "rgba(124,158,255,0.15)",
                  borderRadius: 3,
                }}
              />
            )}
          </div>

          {/* Magnifier loupe: shows a further-magnified crop right where the
              cursor is, so placing/adjusting a box over small text doesn't
              require guessing. Fixed-positioned (not clipped by the
              scrollable image container) and offset above the cursor so a
              finger or mouse pointer never covers the very thing being
              inspected. */}
          {manualMode && magnifierPos && imgRendered && (
            <div
              className="pointer-events-none fixed z-50 overflow-hidden rounded-lg"
              style={{
                left: Math.max(8, magnifierPos.clientX - 85),
                top: Math.max(8, magnifierPos.clientY - 190),
                width: LOUPE_W,
                height: LOUPE_H,
                border: "1.5px solid #7c9eff",
                boxShadow: "0 8px 24px rgba(0,0,0,0.55)",
                background: `#0d0e12 url(${previewUrl}) no-repeat`,
                backgroundSize: `${imgRendered.w * MAG}px ${imgRendered.h * MAG}px`,
                backgroundPosition: `${-(magnifierPos.x * MAG - LOUPE_W / 2)}px ${-(magnifierPos.y * MAG - LOUPE_H / 2)}px`,
              }}
            >
              {/* Re-draw every box that appears on the main image, scaled
                  into the loupe's own coordinate space — otherwise the
                  loupe shows only raw pixels and hides exactly what the
                  user drew to check. */}
              {result &&
                result.findings.map((f: Finding) => {
                  const r = toLoupeRect(f.bbox.x0 * scaleX, f.bbox.y0 * scaleY, f.bbox.x1 * scaleX, f.bbox.y1 * scaleY);
                  if (!r) return null;
                  return (
                    <div
                      key={`mag-${f.id}`}
                      className="absolute"
                      style={{
                        left: r.left, top: r.top, width: Math.max(2, r.width), height: Math.max(2, r.height),
                        border: `1px solid ${bandColorVar(f.severity >= 7 ? "critical" : f.severity >= 4 ? "medium" : "low")}`,
                        background: "rgba(255,59,78,0.1)",
                      }}
                    />
                  );
                })}
              {manualBoxes.map((b) => {
                const r = toLoupeRect(b.x0 * scaleX, b.y0 * scaleY, b.x1 * scaleX, b.y1 * scaleY);
                if (!r) return null;
                return (
                  <div
                    key={`mag-${b.id}`}
                    className="absolute"
                    style={{ left: r.left, top: r.top, width: Math.max(2, r.width), height: Math.max(2, r.height), border: "1.5px solid #7c9eff", background: "rgba(124,158,255,0.2)" }}
                  />
                );
              })}
              {draftBox &&
                (() => {
                  const r = toLoupeRect(draftBox.x0, draftBox.y0, draftBox.x1, draftBox.y1);
                  if (!r) return null;
                  return (
                    <div
                      className="absolute"
                      style={{ left: r.left, top: r.top, width: Math.max(2, r.width), height: Math.max(2, r.height), border: "1.5px dashed #7c9eff", background: "rgba(124,158,255,0.2)" }}
                    />
                  );
                })()}

              {/* crosshair marking the exact point under the cursor */}
              <div
                className="absolute"
                style={{ left: "50%", top: "50%", width: 1, height: 16, background: "#7c9eff", transform: "translate(-50%,-50%)", opacity: 0.85 }}
              />
              <div
                className="absolute"
                style={{ left: "50%", top: "50%", width: 16, height: 1, background: "#7c9eff", transform: "translate(-50%,-50%)", opacity: 0.85 }}
              />
            </div>
          )}

          <div className="px-1.5 pt-[18px] pb-1.5">
            {STEP_LABELS.map(({ phase: stepPhase, label }, i) => {
              const state =
                phase === "error"
                  ? "pending"
                  : i < currentStepIndex || done
                  ? "done"
                  : i === currentStepIndex
                  ? "active"
                  : "pending";
              const displayLabel =
                stepPhase === "building_chain" && state === "active" ? THINKING_ROTATION[thinkingIdx].replace("…", "") : label;
              return (
                <div
                  key={stepPhase}
                  className="font-mono flex items-center gap-2.5 py-[7px] text-[12.5px]"
                  style={{ color: state === "pending" ? "var(--muted-dim)" : "var(--text)", opacity: state === "pending" ? 0.4 : 1 }}
                >
                  {state === "done" && <CheckCircle2 size={14} color="var(--green)" />}
                  {state === "active" && <Loader2 size={14} color="var(--red)" className="animate-spin-slow" />}
                  {state === "pending" && (
                    <span className="h-[14px] w-[14px] rounded-full" style={{ border: "1px solid var(--hairline)" }} />
                  )}
                  {displayLabel}
                  {stepPhase === "scanning_screenshot" && phase === "scanning_screenshot" && ocrPct > 0 ? ` — ${ocrPct}%` : ""}
                  {stepPhase === "building_chain" && state === "active" ? "…" : ""}
                  {stepPhase === "extracting_metadata" && deepScan && (
                    <span
                      className="font-mono ml-1 rounded-full px-2 py-0.5 text-[10px]"
                      style={{ color: "var(--red)", border: "1px solid var(--red-border)", background: "var(--red-dim)" }}
                    >
                      deep scan on{phase === "extracting_metadata" && localScanPct > 0 && localScanPct < 100 ? ` — model ${localScanPct}%` : ""}
                    </span>
                  )}
                </div>
              );
            })}
            {phase === "choosing_destination" && (
              <button
                onClick={() =>
                  destinationPickerRef.current?.scrollIntoView({ behavior: "smooth", block: "center" })
                }
                className="font-mono flex w-full items-center gap-2.5 rounded-md py-[7px] text-left text-[12.5px]"
                style={{ color: "var(--amber)", background: "none", border: "none", cursor: "pointer" }}
              >
                <MousePointerClick size={14} color="var(--amber)" />
                Your input needed above — pick a destination to continue ↑
              </button>
            )}
            {done && (
              <div className="font-mono flex items-center gap-2.5 py-[7px] text-[12.5px]" style={{ color: "var(--green)" }}>
                <CheckCircle2 size={14} color="var(--green)" />
                Analysis Complete
              </div>
            )}
            {phase === "error" && (
              <div className="font-mono py-[7px] text-[12.5px]" style={{ color: "var(--red)" }}>
                {errorMsg}
              </div>
            )}
          </div>
        </Card>

        {/* Right: findings summary */}
        <Card style={{ padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
          <div className="flex items-center justify-between">
            <span className="font-mono text-[11.5px] uppercase tracking-[0.1em]" style={{ color: "var(--muted-dim)" }}>
              Findings
              {chosenDestination && done ? ` · sharing to ${chosenDestination.label}` : ""}
            </span>
            {!done ? (
              <span className="font-mono text-[11px]" style={{ color: "var(--red)" }}>
                {phase === "building_chain" ? "simulating…" : phase === "choosing_destination" ? "waiting…" : "analyzing…"}
              </span>
            ) : simError ? (
              <span className="font-mono text-[11px]" style={{ color: "var(--amber)" }}>
                simulation unavailable
              </span>
            ) : (
              <span className="font-mono text-[11px]" style={{ color: "var(--green)" }}>
                complete
              </span>
            )}
          </div>

          {!done ? (
            <>
              {[0, 1, 2].map((i) => (
                <div key={i} className="rounded-xl p-4" style={{ border: "1px solid var(--hairline)", background: "rgba(255,255,255,0.015)" }}>
                  <div className="skeleton-bar mb-2.5 h-2.5 rounded" style={{ width: "38%" }} />
                  <div className="skeleton-bar mb-1.5 h-2 rounded" style={{ width: "92%" }} />
                  <div className="skeleton-bar h-2 rounded" style={{ width: "70%" }} />
                </div>
              ))}
            </>
          ) : hasFindings ? (
            <div className="flex flex-col gap-2.5">
              {result!.findings.map((f, i) => (
                <motion.div
                  key={f.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: i * 0.06, ease: "easeOut" }}
                >
                  <FindingCard finding={f} />
                </motion.div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2.5 py-8 text-center">
              <div className="text-[13px]" style={{ color: "var(--muted)", maxWidth: 280 }}>
                Local OCR and pattern matching found nothing, so Gemini was never called. Still worth a human look before you post it.
              </div>
            </div>
          )}

          {done && simError && hasFindings && (
            <div
              className="flex items-start gap-2.5 rounded-xl p-3.5"
              style={{ border: "1px solid var(--amber-border)", background: "var(--amber-dim)" }}
            >
              <AlertOctagon size={16} color="var(--amber)" style={{ flexShrink: 0, marginTop: 1 }} />
              <div className="text-[12.5px] leading-relaxed" style={{ color: "var(--text)" }}>
                <div className="font-display mb-1 font-semibold" style={{ color: "var(--amber)" }}>
                  Attacker simulation unavailable
                </div>
                {simError} Findings and metadata above are unaffected.
                {/\bNo AI provider is configured\b/i.test(simError) && (
                  <>
                    {" "}
                    Set <code className="font-mono">GEMINI_API_KEY</code> and/or{" "}
                    <code className="font-mono">OPENROUTER_API_KEY</code> in{" "}
                    <code className="font-mono">.env.local</code> and rescan to enable this.
                  </>
                )}
              </div>
            </div>
          )}

          <div style={{ borderTop: "1px solid var(--hairline)", paddingTop: 14 }}>
            <button
              onClick={() => setMetaOpen((v) => !v)}
              className="font-mono flex w-full items-center justify-between text-[11.5px]"
              style={{ color: "var(--muted)", background: "none", border: "none", cursor: "pointer" }}
              disabled={!done}
            >
              <span>metadata payload ({metadata.length}) — exactly what was sent to Gemini</span>
              <ChevronDown size={13} style={{ transform: metaOpen ? "rotate(180deg)" : "none", transition: "transform 150ms" }} />
            </button>
            {metaOpen && done && (
              <pre
                className="font-mono mt-2.5 max-h-[220px] overflow-auto rounded-lg p-3 text-[11px] leading-relaxed"
                style={{ background: "#0d0e12", border: "1px solid var(--hairline)", color: "var(--muted)" }}
              >
                {JSON.stringify(metadata, null, 2)}
              </pre>
            )}
          </div>
        </Card>
      </div>

      {/* Full-width story section: leak chain, timelines, attacker/defender views */}
      {done && hasFindings && simulation && (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.15 }}
          className="mt-8"
        >
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
            <span className="font-display text-[18px] font-semibold">The story</span>
            <ViewTabs value={view} onChange={setView} />
          </div>

          <div className="mb-8 flex flex-col gap-8">
            <TimeToExploitTimeline entries={timelineEntries} />
            <PostUploadTimeline />
          </div>

          <AnimatePresence mode="wait">
            {view === "attacker" ? (
              <motion.div
                key="attacker"
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 8 }}
                transition={{ duration: 0.25 }}
                className="flex flex-col gap-8"
              >
                <div className="text-center">
                  <span className="text-[13px]" style={{ color: "var(--muted)" }}>
                    How the attacker thinks.
                  </span>
                </div>
                {leakChainSteps.steps.length > 0 && (
                  <Card style={{ padding: 22 }}>
                    <LeakChain title={leakChainSteps.title} steps={leakChainSteps.steps} />
                  </Card>
                )}
                <div className="grid gap-3.5" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
                  {result!.findings.map((f) => {
                    const sim = simulation.assets.find((a) => a.assetId === f.id);
                    if (!sim) return null;
                    return <AttackCard key={f.id} title={f.label} sim={sim} hideImpact />;
                  })}
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="defender"
                initial={{ opacity: 0, x: 8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -8 }}
                transition={{ duration: 0.25 }}
                className="flex flex-col gap-8"
              >
                <div className="text-center">
                  <span className="text-[13px]" style={{ color: "var(--muted)" }}>
                    How to prevent it.
                  </span>
                </div>

                {simulation.attackChain?.chainPossible && (
                  <Card style={{ padding: 20, border: "1px solid var(--red-border)", background: "var(--red-dim)" }}>
                    <div className="mb-2 flex items-center gap-2">
                      <Link2 size={15} color="var(--red)" />
                      <span className="font-display text-[14px] font-semibold">Combined business impact</span>
                    </div>
                    <p className="text-[13px] leading-relaxed" style={{ color: "var(--text)" }}>
                      {simulation.attackChain.businessImpact}
                    </p>
                  </Card>
                )}

                <div>
                  <div className="font-mono mb-3 text-[10.5px] uppercase tracking-[0.08em]" style={{ color: "var(--muted-dim)" }}>
                    Business impact engine
                  </div>
                  <div className="grid gap-3.5" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
                    {result!.findings.map((f, i) => {
                      const sim = simulation.assets.find((a) => a.assetId === f.id);
                      if (!sim) return null;
                      return (
                        <BusinessImpactCard
                          key={f.id}
                          label={f.label}
                          impact={sim.businessImpact}
                          breakdown={sim.businessImpactBreakdown}
                          severity={f.severity}
                          index={i}
                        />
                      );
                    })}
                  </div>
                </div>

                <div>
                  <div className="font-mono mb-3 text-[10.5px] uppercase tracking-[0.08em]" style={{ color: "var(--muted-dim)" }}>
                    Recommended actions
                  </div>
                  <div className="flex flex-col gap-4">
                    {result!.findings.map((f) => {
                      const sim = simulation.assets.find((a) => a.assetId === f.id);
                      if (!sim || sim.recommendations.length === 0) return null;
                      return (
                        <div key={f.id}>
                          <div className="font-display mb-1.5 text-[13px] font-semibold">{f.label}</div>
                          <ul className="flex flex-col gap-1.5">
                            {sim.recommendations.map((r, i) => (
                              <li key={i} className="flex items-start gap-2 text-[12.5px]" style={{ color: "var(--text)" }}>
                                <CheckSquare size={14} color="var(--green)" style={{ flexShrink: 0, marginTop: 1 }} />
                                {r}
                              </li>
                            ))}
                          </ul>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </div>
  );
}