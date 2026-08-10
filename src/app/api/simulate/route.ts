import { NextRequest, NextResponse } from "next/server";
import { runAttackSimulation } from "@/lib/gemini";
import type { AssetMetadata } from "@/lib/metadata";
import { DESTINATIONS, DestinationId } from "@/lib/destinations";

const ALLOWED_CATEGORIES = new Set(["credential", "network", "identifier", "pii"]);
const ALLOWED_VISIBILITY = new Set(["Fully Visible"]);
const ALLOWED_ENV = new Set(["Production", "Staging", "Development", "Unknown"]);
const ALLOWED_SEVERITY = new Set(["low", "medium", "high", "critical"]);
const ALLOWED_DESTINATIONS = new Set(DESTINATIONS.map((d) => d.id));

/**
 * Defense in depth: even though the client is only ever supposed to build
 * AssetMetadata objects (see lib/metadata.ts, which never includes raw
 * secret values), we re-validate and rebuild each object field-by-field
 * here before it goes anywhere near the Gemini call. Nothing outside this
 * known-safe shape can pass through.
 */
function sanitize(input: unknown): AssetMetadata | null {
  if (!input || typeof input !== "object") return null;
  const m = input as Record<string, unknown>;
  if (typeof m.id !== "string" || typeof m.assetType !== "string") return null;
  if (!ALLOWED_CATEGORIES.has(m.category as string)) return null;
  if (!ALLOWED_ENV.has(m.environment as string)) return null;
  if (!ALLOWED_VISIBILITY.has(m.visibility as string)) return null;
  if (!ALLOWED_SEVERITY.has(m.severityHint as string)) return null;

  return {
    id: m.id,
    assetType: m.assetType,
    category: m.category as AssetMetadata["category"],
    environment: m.environment as AssetMetadata["environment"],
    visibility: m.visibility as AssetMetadata["visibility"],
    severityHint: m.severityHint as AssetMetadata["severityHint"],
    characterCount: typeof m.characterCount === "number" ? m.characterCount : 0,
  };
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const rawList = (body as Record<string, unknown>)?.metadata;
  if (!Array.isArray(rawList)) {
    return NextResponse.json({ error: "Expected `metadata` to be an array." }, { status: 400 });
  }
  if (rawList.length > 25) {
    return NextResponse.json({ error: "Too many assets in a single request." }, { status: 400 });
  }

  const sanitized = rawList.map(sanitize).filter((m): m is AssetMetadata => m !== null);
  if (sanitized.length === 0) {
    return NextResponse.json({ assets: [], attackChain: null });
  }

  const rawDestination = (body as Record<string, unknown>)?.destination;
  const destination: DestinationId | null =
    typeof rawDestination === "string" && ALLOWED_DESTINATIONS.has(rawDestination as DestinationId)
      ? (rawDestination as DestinationId)
      : null;

  try {
    const result = await runAttackSimulation(sanitized, destination);
    return NextResponse.json(result);
  } catch (err) {
    console.error("[/api/simulate]", err);
    const message = err instanceof Error ? err.message : "Attacker simulation failed.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
