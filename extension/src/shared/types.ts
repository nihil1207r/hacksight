import type { DetectionResult, Finding } from "@hacksight/lib/detectSecrets";
import type { SiteId } from "./sites";

export type ScanTier = "safe" | "mostly_safe" | "think_again" | "do_not_share";

export interface ScanSummary {
  score: number;
  tier: ScanTier;
  findings: Finding[];
  site: SiteId;
  scannedAt: number;
  imageName: string;
  error?: string;
}

export interface Settings {
  enabled: boolean;
  siteEnabled: Record<string, boolean>;
  customDomains: string[];
  /** When true, HackSight reviews image uploads on every http(s) site, not
   * just the supported list and any custom domains added individually.
   * Requires the user to explicitly grant the broad host permission first —
   * see registerAllSitesContentScript in background/index.ts. */
  protectAllSites: boolean;
  deepScan: boolean;
  cloudSemanticScan: boolean;
  openRouterApiKey: string;
}

export const DEFAULT_SETTINGS: Settings = {
  enabled: true,
  siteEnabled: { github: true, reddit: true, discord: true, stackoverflow: true, linkedin: true },
  customDomains: [],
  protectAllSites: false,
  deepScan: true,
  cloudSemanticScan: false,
  openRouterApiKey: "",
};

export interface ScanResponse {
  result: DetectionResult;
  summary: ScanSummary;
}

export interface LocalScanRequest {
  file: File;
  site: SiteId;
  settings: Settings;
  onProgress?: (label: string) => void;
}

export function tierForScore(score: number): ScanTier {
  // Mirrors SafeToShareHero in the main web app.
  if (score >= 90) return "safe";
  if (score >= 70) return "mostly_safe";
  if (score >= 40) return "think_again";
  return "do_not_share";
}

export function safeToShareScore(result: DetectionResult): number {
  return Math.max(0, 100 - result.overallScore);
}

export function makeSummary(result: DetectionResult, site: SiteId, imageName: string, error?: string): ScanSummary {
  const score = safeToShareScore(result);
  return { score, tier: tierForScore(score), findings: result.findings, site, imageName, scannedAt: Date.now(), error };
}

/** A failed scan must never look safe. The user may still explicitly choose
 * Continue anyway, but the UI, toolbar badge, and stored summary all make it
 * clear that HackSight could not assess the image. */
export function makeFailedScanSummary(site: SiteId, imageName: string, error: string): ScanSummary {
  return {
    score: 0,
    tier: "do_not_share",
    findings: [],
    site,
    imageName,
    scannedAt: Date.now(),
    error,
  };
}
