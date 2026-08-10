/**
 * Option B: a second pass over OCR'd text that catches sensitive info the
 * regex patterns in patterns.ts structurally can't (names, addresses,
 * workplace, family, unlabeled account/security info). Unlike the rest of
 * the pipeline, this sends real OCR TEXT (not the image) to an external LLM
 * — a real privacy trade-off versus the metadata-only Gemini/OpenRouter call
 * in gemini.ts. Callers should treat this as opt-in, not silent.
 */

export type SemanticCategory =
  | "person_name"
  | "physical_address"
  | "employer_or_workplace"
  | "family_relation"
  | "account_identifier"
  | "security_answer"
  | "other_sensitive";

export interface SemanticFinding {
  text: string;
  category: SemanticCategory;
  reason: string;
  lineIndex: number;
}

const SEMANTIC_CATEGORIES: SemanticCategory[] = [
  "person_name",
  "physical_address",
  "employer_or_workplace",
  "family_relation",
  "account_identifier",
  "security_answer",
  "other_sensitive",
];

const SYSTEM_PROMPT = `You are a precise sensitive-information scanner reviewing OCR text extracted
from a screenshot, immediately before that screenshot is shared publicly.

A separate regex-based pass has ALREADY caught structured-format secrets:
known API key formats, tokens, credit cards, SSNs, IPs, emails, phone
numbers, IBANs, VINs, passport numbers (when labeled), and dates of birth
(when labeled). Do NOT re-flag anything that would already match one of
those known shapes — your job is the gap: sensitive information with no
fixed pattern that only a human (or a model) can recognize by context.

Flag ONLY these categories, and only when clearly present:
- person_name: a full name identifiable as belonging to a real individual
  (not a generic label like "User" or "Admin"), especially alongside other
  identifying context (title, company, email, address).
- physical_address: a street address, unit number, or other specific
  real-world location tied to a person or organization.
- employer_or_workplace: a specific company/organization name in a context
  that identifies where a named person works.
- family_relation: a reference naming a specific relative
  ("my son Alex", "wife: Jane Doe").
- account_identifier: a username, customer ID, employee ID, or account
  number that isn't a structured secret format but could identify or
  authenticate a specific person or account.
- security_answer: an answer to a security question, a password visible in
  plaintext, or a PIN — in any format, even if it doesn't look like a known
  credential shape.
- other_sensitive: anything else clearly private and identifying that
  doesn't fit the categories above — use sparingly, and explain briefly why.

Rules:
1. Only flag a span if the EXACT text appears verbatim in the input you are
   given. Never paraphrase, summarize, or invent a match — the output value
   must be copy-pasteable directly out of the input text.
2. Only flag high-confidence items. If you are unsure whether something is
   actually sensitive/identifying, do not flag it. Under-flagging common,
   ambiguous text is preferred over flagging generic words, common first
   names used casually, or placeholder/example data (e.g. "John Doe",
   "example.com", "123 Main St" used as a filler example).
3. Never invent categories, real people, or context not present in the text.
4. Return ONLY the findings that meet the bar above. If there are none,
   return an empty array — do not force a result.
5. Output must be valid JSON matching the provided schema exactly. No prose,
   no markdown, no explanation outside the JSON.`;

const SCHEMA = {
  name: "sensitive_info_scan",
  strict: true,
  schema: {
    type: "object",
    properties: {
      findings: {
        type: "array",
        items: {
          type: "object",
          properties: {
            text: { type: "string" },
            category: { type: "string", enum: SEMANTIC_CATEGORIES },
            reason: { type: "string" },
            lineIndex: { type: "integer" },
          },
          required: ["text", "category", "reason", "lineIndex"],
          additionalProperties: false,
        },
      },
    },
    required: ["findings"],
    additionalProperties: false,
  },
};

function isValidFinding(v: unknown, maxLineIndex: number): v is SemanticFinding {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.text === "string" &&
    o.text.length > 0 &&
    typeof o.reason === "string" &&
    typeof o.lineIndex === "number" &&
    Number.isInteger(o.lineIndex) &&
    o.lineIndex >= 0 &&
    o.lineIndex <= maxLineIndex &&
    SEMANTIC_CATEGORIES.includes(o.category as SemanticCategory)
  );
}

/**
 * Lets the frontend render "Deep Scan" as a real, honest toggle: disabled
 * with an explanation when no provider key is configured server-side,
 * rather than silently no-op'ing when the user turns it on.
 */
export function isSemanticScanConfigured(): boolean {
  return Boolean(process.env.OPENROUTER_API_KEY);
}

/**
 * Scans OCR'd lines of text for sensitive info regex can't catch. Returns
 * an empty array (rather than throwing) if no provider is configured, so
 * this optional pass never breaks the primary regex-based flow.
 */
export async function runSemanticScan(lineTexts: string[]): Promise<SemanticFinding[]> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return [];

  const nonEmpty = lineTexts.some((t) => t.trim().length > 0);
  if (!nonEmpty) return [];

  const model = process.env.SEMANTIC_SCAN_MODEL || "openai/gpt-4.1-mini";
  const userMessage = `Scan the following OCR text (one line per numbered entry) for sensitive information per your instructions.\n\n${lineTexts
    .map((t, i) => `${i}: ${t}`)
    .join("\n")}`;

  let res: Response;
  try {
    res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": "https://hacksight.local",
        "X-Title": "HackSight",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userMessage },
        ],
        temperature: 0.2,
        max_tokens: 2000,
        response_format: { type: "json_schema", json_schema: SCHEMA },
      }),
    });
  } catch (err) {
    const cause = err instanceof Error && "cause" in err ? (err.cause as { code?: string; message?: string } | undefined) : undefined;
    throw new Error(`Could not reach openrouter.ai for semantic scan${cause?.code ? ` (${cause.code})` : ""}.`);
  }

  if (!res.ok) {
    const bodyText = await res.text().catch(() => "");
    throw new Error(`OpenRouter semantic scan error (${res.status}): ${bodyText.slice(0, 300)}`);
  }

  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content;
  if (!text || typeof text !== "string") throw new Error("OpenRouter returned no usable content for semantic scan.");

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Semantic scan response was not valid JSON.");
  }

  const rawFindings = (parsed as Record<string, unknown> | null)?.findings;
  if (!Array.isArray(rawFindings)) return [];

  const maxLineIndex = lineTexts.length - 1;
  return rawFindings.filter((f): f is SemanticFinding => isValidFinding(f, maxLineIndex));
}
