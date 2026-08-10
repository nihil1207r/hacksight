import { NextRequest, NextResponse } from "next/server";
import { runSemanticScan, isSemanticScanConfigured } from "@/lib/semanticScan";

const MAX_LINES = 200;
const MAX_LINE_LENGTH = 500;

// Lets the Deep Scan toggle in the UI reflect reality (configured or not)
// instead of a checkbox that silently does nothing when OPENROUTER_API_KEY
// is missing.
export async function GET() {
  return NextResponse.json({ available: isSemanticScanConfigured() });
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const rawLines = (body as Record<string, unknown>)?.lines;
  if (!Array.isArray(rawLines)) {
    return NextResponse.json({ error: "Expected `lines` to be an array of strings." }, { status: 400 });
  }
  if (rawLines.length > MAX_LINES) {
    return NextResponse.json({ error: "Too many lines in a single request." }, { status: 400 });
  }

  const lines = rawLines.map((l) => (typeof l === "string" ? l.slice(0, MAX_LINE_LENGTH) : ""));

  try {
    const findings = await runSemanticScan(lines);
    return NextResponse.json({ findings });
  } catch (err) {
    console.error("[/api/semantic-scan]", err);
    const message = err instanceof Error ? err.message : "Semantic scan failed.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
