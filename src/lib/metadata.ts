import { Finding } from "./detectSecrets";

/**
 * Exactly what HackSight is allowed to send onward for attacker simulation.
 * No raw secret values, no OCR text, no image data — structural descriptors
 * only. Phase 3 will POST an array of these to Gemini.
 */
export interface AssetMetadata {
  id: string;
  assetType: string;
  category: string;
  environment: Finding["environment"];
  visibility: Finding["visibility"];
  severityHint: "low" | "medium" | "high" | "critical";
  characterCount: number;
}

function severityHint(severity: number): AssetMetadata["severityHint"] {
  if (severity >= 8) return "critical";
  if (severity >= 6) return "high";
  if (severity >= 4) return "medium";
  return "low";
}

export function toMetadata(findings: Finding[]): AssetMetadata[] {
  return findings.map((f) => ({
    id: f.id,
    assetType: f.type,
    category: f.category,
    environment: f.environment,
    visibility: f.visibility,
    severityHint: severityHint(f.severity),
    characterCount: f.rawValue.length,
  }));
}
