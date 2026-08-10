import type { SemanticFinding } from "@hacksight/lib/semanticScan";

const CATEGORIES = [
  "person_name",
  "physical_address",
  "employer_or_workplace",
  "family_relation",
  "account_identifier",
  "security_answer",
  "other_sensitive",
] as const;

const SYSTEM_PROMPT = `You are a precise sensitive-information scanner reviewing OCR text before a public share. A local regex pass already catches structured credentials, payment information, emails, phone numbers, IPs, and similar known patterns. Flag only high-confidence, unstructured sensitive information: full person names with identifying context, physical addresses, workplace identifiers tied to a person, named family members, account IDs, plaintext passwords/security answers, or other clearly private identifying facts. The text field in every finding MUST appear verbatim in the numbered input line. Do not repeat structured secrets and do not invent or paraphrase. Return JSON only.`;

export async function runCloudSemanticScan(lines: string[], apiKey: string): Promise<SemanticFinding[]> {
  if (!apiKey.trim() || !lines.some((line) => line.trim())) return [];
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey.trim()}`, "X-Title": "HackSight AI" },
    body: JSON.stringify({
      model: "openai/gpt-4.1-mini",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: lines.map((line, index) => `${index}: ${line}`).join("\n") },
      ],
      temperature: 0.1,
      max_tokens: 1600,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "hacksight_semantic_findings",
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
                    category: { type: "string", enum: CATEGORIES },
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
        },
      },
    }),
  });
  if (!response.ok) throw new Error(`OpenRouter semantic scan failed (${response.status}).`);
  const body = await response.json();
  const text = body?.choices?.[0]?.message?.content;
  if (typeof text !== "string") throw new Error("OpenRouter returned no semantic findings.");
  const parsed = JSON.parse(text) as { findings?: unknown };
  if (!Array.isArray(parsed.findings)) return [];
  return parsed.findings.filter((finding): finding is SemanticFinding => {
    if (!finding || typeof finding !== "object") return false;
    const item = finding as Record<string, unknown>;
    return (
      typeof item.text === "string" &&
      typeof item.reason === "string" &&
      typeof item.lineIndex === "number" &&
      Number.isInteger(item.lineIndex) &&
      item.lineIndex >= 0 &&
      item.lineIndex < lines.length &&
      CATEGORIES.includes(item.category as (typeof CATEGORIES)[number]) &&
      lines[item.lineIndex].includes(item.text)
    );
  });
}
