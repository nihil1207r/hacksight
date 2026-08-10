import { PATTERNS, AssetType, AssetCategory, severityBand } from "./patterns";
import type { SemanticFinding } from "./semanticScan";

export interface BBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface OcrSymbol {
  text: string;
  bbox: BBox;
}

export interface OcrWord {
  text: string;
  bbox: BBox;
  /** Character-level bounding boxes within this word, in order. Used to
   * compute a redaction box that covers only the matched substring instead
   * of the whole word — critical for cases like "GEMINI_API_KEY=AQ.xxx"
   * where Tesseract sees the entire assignment as one space-free "word" but
   * only the value after "=" should ever be blurred. Optional/omittable so
   * callers that only have word-level data still work (falls back to
   * treating the whole word as one span). */
  symbols?: OcrSymbol[];
}

export interface OcrLine {
  text: string;
  words: OcrWord[];
}

export interface Finding {
  id: string;
  type: AssetType;
  label: string;
  category: AssetCategory;
  severity: number;
  rawValue: string;
  maskedValue: string;
  bbox: BBox;
  environment: "Production" | "Staging" | "Development" | "Unknown";
  visibility: "Fully Visible";
}

export interface DetectionResult {
  findings: Finding[];
  overallScore: number;
  band: "low" | "medium" | "critical";
  documentEnvironment: "Production" | "Staging" | "Development" | "Unknown";
}

const ENV_KEYWORDS: Array<[RegExp, Finding["environment"]]> = [
  [/\b(prod|production)\b/i, "Production"],
  [/\b(staging|stage|uat)\b/i, "Staging"],
  [/\b(dev|development|localhost|local)\b/i, "Development"],
];

function guessEnvironment(text: string): Finding["environment"] {
  for (const [re, label] of ENV_KEYWORDS) {
    if (re.test(text)) return label;
  }
  return "Unknown";
}

function maskValue(type: AssetType, value: string): string {
  switch (type) {
    case "aws_access_key":
      return value.slice(0, 4) + "•".repeat(Math.max(4, value.length - 4));
    case "openai_key":
      return value.slice(0, 3) + "•".repeat(Math.min(24, Math.max(6, value.length - 3)));
    case "github_token":
      return value.slice(0, 4) + "•".repeat(Math.max(6, value.length - 4));
    case "google_api_key":
      return value.slice(0, 6) + "•".repeat(Math.max(6, value.length - 6));
    case "stripe_key":
      return value.slice(0, 7) + "•".repeat(Math.max(6, value.length - 7));
    case "slack_token":
      return value.slice(0, 5) + "•".repeat(Math.max(6, value.length - 5));
    case "slack_webhook":
    case "discord_webhook":
      return value.split("/").slice(0, 3).join("/") + "/••••••••";
    case "discord_token":
      return value.slice(0, 6) + "•".repeat(Math.max(8, value.length - 6));
    case "telegram_bot_token": {
      const [id] = value.split(":");
      return `${id}:${"•".repeat(10)}`;
    }
    case "twilio_key":
    case "sendgrid_key":
    case "npm_token":
    case "shopify_token":
    case "digitalocean_token":
    case "dockerhub_token":
      return value.slice(0, 6) + "•".repeat(Math.max(6, value.length - 6));
    case "azure_storage_key":
      return "AccountKey=" + "•".repeat(12);
    case "private_key_block":
      return value; // just the header line ("-----BEGIN ... PRIVATE KEY-----"); no secret material in it
    case "basic_auth_url": {
      try {
        const u = new URL(value);
        return `${u.protocol}//••••:••••@${u.host}${u.pathname || ""}`;
      } catch {
        return "••••••••";
      }
    }
    case "bearer_token":
      return "Bearer " + "•".repeat(12);
    case "credit_card": {
      const digits = value.replace(/[ -]/g, "");
      return "•".repeat(Math.max(0, digits.length - 4)) + digits.slice(-4);
    }
    case "ssn":
      return "•••-••-" + value.slice(-4);
    case "generic_secret_assignment": {
      // Keep the key name visible (e.g. "GEMINI_API_KEY=") since that's
      // useful context, but fully mask the secret value after it.
      const idx = value.search(/[:=]/);
      if (idx === -1) return "••••••••";
      return `${value.slice(0, idx + 1)} ••••••••`;
    }
    case "jwt":
      return value.split(".")[0] + ".•••.•••";
    case "database_url": {
      try {
        const withScheme = value.match(/^[a-z0-9+]+:\/\//i)?.[0] ?? "";
        const rest = value.slice(withScheme.length);
        const hostPart = rest.includes("@") ? rest.split("@").pop() : rest;
        return `${withScheme}••••:••••@${hostPart}`;
      } catch {
        return "••••••••";
      }
    }
    case "email": {
      const [, domain] = value.split("@");
      return `••••@${domain ?? "•••"}`;
    }
    case "gcp_service_account_key":
      return `"type": "service_account" (key file)`;
    case "ethereum_private_key":
      return "0x" + "•".repeat(12);
    case "square_token":
    case "paypal_braintree_token":
    case "mailchimp_api_key":
      return value.slice(0, 6) + "•".repeat(Math.max(6, value.length - 6));
    case "mac_address":
      return value.slice(0, 8) + "••:••:••";
    case "iban":
      return value.slice(0, 4) + "•".repeat(Math.max(6, value.length - 4));
    case "phone_number":
      return "•".repeat(Math.max(0, value.replace(/\D/g, "").length - 2)) + value.slice(-2);
    case "vin":
      return "•".repeat(13) + value.slice(-4);
    case "passport_number":
      return "Passport •••••••";
    case "date_of_birth":
      return "DOB ••/••/••••";
    case "person_name":
    case "physical_address":
    case "employer_or_workplace":
    case "family_relation":
    case "account_identifier":
    case "security_answer":
    case "other_sensitive":
    case "social_handle":
      // Free-text semantic findings (Option B) — no useful partial reveal,
      // so mask fully rather than risk showing part of a name/address.
      return "•".repeat(Math.min(12, Math.max(6, value.length)));
    case "manual_redaction":
      // User-drawn box, not a detected value — there's no rawValue text to
      // partially reveal, so this is just a fixed placeholder.
      return "••••••";
    case "internal_url":
    case "url": {
      try {
        const u = new URL(value);
        return `${u.protocol}//${u.host}/••••`;
      } catch {
        return value.slice(0, 12) + "••••";
      }
    }
    default:
      return value;
  }
}

/** Flattens a line's words into one string (single-space joined) and records
 * the character span each character occupies, so regex match offsets map
 * back to a tight bounding box covering only the matched substring — not
 * the whole word it's embedded in (critical for space-free tokens like
 * "KEY=value" where Tesseract reports one "word" for the entire thing).
 *
 * SAFETY: `text` is always built from the word-level `w.text` — the same
 * trusted source used before symbol data existed — never from concatenated
 * symbols. Per-character symbol bboxes are only used when they can be
 * verified to reconstruct `w.text` exactly (same length, same characters);
 * if Tesseract dropped, merged, or reordered any symbols, that mismatch is
 * detected and this word falls back to one whole-word span instead. This
 * fallback intentionally over-redacts (blurs a bit more than necessary)
 * rather than risk the alternative — under-redaction that leaves part of a
 * real secret visible, which is a far worse failure for a tool like this. */
function indexLine(line: OcrLine) {
  let text = "";
  const spans: { start: number; end: number; bbox: BBox }[] = [];
  line.words.forEach((w, i) => {
    if (i > 0) text += " ";
    const start = text.length;
    text += w.text;

    const symbolText = w.symbols?.map((s) => s.text).join("") ?? "";
    const symbolsReliable = !!w.symbols && w.symbols.length > 0 && symbolText === w.text;

    if (symbolsReliable) {
      let cursor = start;
      for (const sym of w.symbols!) {
        const symStart = cursor;
        cursor += sym.text.length;
        spans.push({ start: symStart, end: cursor, bbox: sym.bbox });
      }
    } else {
      spans.push({ start, end: text.length, bbox: w.bbox });
    }
  });
  return { text, spans };
}

function unionBBox(boxes: BBox[]): BBox {
  return {
    x0: Math.min(...boxes.map((b) => b.x0)),
    y0: Math.min(...boxes.map((b) => b.y0)),
    x1: Math.max(...boxes.map((b) => b.x1)),
    y1: Math.max(...boxes.map((b) => b.y1)),
  };
}

interface RawMatch {
  type: AssetType;
  label: string;
  category: AssetCategory;
  severity: number;
  start: number;
  end: number;
  value: string;
  bbox: BBox;
  lineText: string;
}

export function detectSecrets(lines: OcrLine[]): DetectionResult {
  const fullDocText = lines.map((l) => l.text).join("\n");
  const documentEnvironment = guessEnvironment(fullDocText);

  const allFindings: Finding[] = [];
  let idCounter = 0;

  for (const line of lines) {
    const { text, spans } = indexLine(line);
    if (!text.trim()) continue;

    const rawMatches: RawMatch[] = [];

    for (const pattern of PATTERNS) {
      pattern.regex.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = pattern.regex.exec(text)) !== null) {
        const start = m.index;
        const end = start + m[0].length;

        // For the generic "KEY=value" catch-all, the match intentionally
        // spans the whole assignment (masking needs the key name), but only
        // the value after the separator should ever get redacted on the
        // image — the variable name is useful debugging context, not a secret.
        let bboxStart = start;
        if (pattern.type === "generic_secret_assignment") {
          const sepIdx = m[0].search(/[:=]/);
          if (sepIdx !== -1) {
            let valueStart = start + sepIdx + 1;
            while (valueStart < end && /[\s"']/.test(text[valueStart])) valueStart++;
            bboxStart = valueStart;
          }
        }

        // OCR frequently splits a long, unbroken value (JWTs, hex secrets,
        // random tokens, and — confirmed in testing — plain URLs at the
        // "://" boundary) into several separate "word" boxes with a phantom
        // gap between them, even though there's no real space in the
        // source. The regex match only spans the first such fragment, so
        // capping the bbox at the match's own `end` risks leaving part of
        // the value fully visible even when detection itself succeeded.
        // Extend the bbox through every remaining span on the line for
        // every finding, not just credentials — over-redacting a trailing
        // character or two is harmless; leaving any part of a flagged value
        // exposed is not, and low-severity network findings are exactly as
        // prone to this OCR word-splitting as credentials are.
        const bboxEnd = text.length;

        const overlapping = spans.filter((s) => s.start < end && s.end > start);
        if (overlapping.length === 0) continue;
        const bboxSpans = spans.filter((s) => s.start < bboxEnd && s.end > bboxStart);
        rawMatches.push({
          type: pattern.type,
          label: pattern.label,
          category: pattern.category,
          severity: pattern.severity,
          start,
          end,
          value: m[0],
          bbox: unionBBox((bboxSpans.length > 0 ? bboxSpans : overlapping).map((s) => s.bbox)),
          lineText: text,
        });
        if (m[0].length === 0) pattern.regex.lastIndex++;
      }
    }

    // Resolve overlaps on this line: higher severity (then longer match) wins.
    rawMatches.sort((a, b) => b.severity - a.severity || b.end - b.start - (a.end - a.start));
    const accepted: RawMatch[] = [];
    for (const cand of rawMatches) {
      const clash = accepted.some((a) => cand.start < a.end && cand.end > a.start);
      if (!clash) accepted.push(cand);
    }

    for (const match of accepted) {
      const env = guessEnvironment(match.lineText) ?? documentEnvironment;
      allFindings.push({
        id: `finding_${idCounter++}`,
        type: match.type,
        label: match.label,
        category: match.category,
        severity: match.severity,
        rawValue: match.value,
        maskedValue: maskValue(match.type, match.value),
        bbox: match.bbox,
        environment: env === "Unknown" ? documentEnvironment : env,
        visibility: "Fully Visible",
      });
    }
  }

  // Overall risk score: highest-severity finding drives the base, each
  // additional finding compounds the exposure slightly.
  return scoreFindings(allFindings, documentEnvironment);
}

/** Shared by detectSecrets() and the semantic-scan merge path so both
 * produce a DetectionResult the same way. */
export function scoreFindings(findings: Finding[], documentEnvironment: Finding["environment"]): DetectionResult {
  let overallScore = 0;
  if (findings.length > 0) {
    const maxSeverity = Math.max(...findings.map((f) => f.severity));
    const base = maxSeverity * 10;
    const bonus = Math.min(20, (findings.length - 1) * 4);
    overallScore = Math.min(100, Math.round(base + bonus));
  }

  return {
    findings,
    overallScore,
    band: severityBand(overallScore),
    documentEnvironment,
  };
}

const SEMANTIC_META: Record<SemanticFinding["category"], { label: string; category: AssetCategory; severity: number }> = {
  person_name: { label: "Person Name", category: "identifier", severity: 4 },
  physical_address: { label: "Physical Address", category: "pii", severity: 5 },
  employer_or_workplace: { label: "Employer / Workplace", category: "pii", severity: 3 },
  family_relation: { label: "Family Member Reference", category: "pii", severity: 4 },
  account_identifier: { label: "Account Identifier", category: "identifier", severity: 5 },
  security_answer: { label: "Security Answer / Password", category: "credential", severity: 8 },
  other_sensitive: { label: "Other Sensitive Info", category: "pii", severity: 5 },
};

/**
 * Maps LLM-reported semantic findings (exact text + line index) back to
 * image bounding boxes, reusing the same line-indexing/OCR-span logic the
 * regex path uses — so both paths produce bboxes the same way. Findings
 * that don't cleanly locate in the given line (bad lineIndex, or the exact
 * text isn't found — e.g. the model paraphrased instead of quoting) are
 * dropped rather than guessed at.
 */
export function buildFindingsFromSemantic(lines: OcrLine[], semanticFindings: SemanticFinding[], idOffset = 0): Finding[] {
  const findings: Finding[] = [];
  let idCounter = idOffset;

  for (const sf of semanticFindings) {
    const line = lines[sf.lineIndex];
    if (!line) continue;

    const { text, spans } = indexLine(line);
    const start = text.indexOf(sf.text);
    if (start === -1) continue;
    const end = start + sf.text.length;

    const overlapping = spans.filter((s) => s.start < end && s.end > start);
    if (overlapping.length === 0) continue;

    const meta = SEMANTIC_META[sf.category];
    const env = guessEnvironment(text);
    findings.push({
      id: `semantic_${idCounter++}`,
      type: sf.category,
      label: meta.label,
      category: meta.category,
      severity: meta.severity,
      rawValue: sf.text,
      maskedValue: maskValue(sf.category, sf.text),
      bbox: unionBBox(overlapping.map((s) => s.bbox)),
      environment: env,
      visibility: "Fully Visible",
    });
  }

  return findings;
}