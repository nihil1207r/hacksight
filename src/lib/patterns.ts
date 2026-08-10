export type AssetType =
  | "aws_access_key"
  | "openai_key"
  | "github_token"
  | "google_api_key"
  | "stripe_key"
  | "slack_token"
  | "slack_webhook"
  | "discord_token"
  | "discord_webhook"
  | "telegram_bot_token"
  | "twilio_key"
  | "sendgrid_key"
  | "npm_token"
  | "shopify_token"
  | "digitalocean_token"
  | "dockerhub_token"
  | "azure_storage_key"
  | "private_key_block"
  | "basic_auth_url"
  | "bearer_token"
  | "credit_card"
  | "ssn"
  | "generic_secret_assignment"
  | "jwt"
  | "email"
  | "database_url"
  | "internal_ip"
  | "ip_address"
  | "internal_url"
  | "url"
  | "phone_number"
  | "mac_address"
  | "iban"
  | "vin"
  | "gcp_service_account_key"
  | "ethereum_private_key"
  | "mailchimp_api_key"
  | "square_token"
  | "paypal_braintree_token"
  | "passport_number"
  | "date_of_birth"
  | "person_name"
  | "physical_address"
  | "employer_or_workplace"
  | "family_relation"
  | "account_identifier"
  | "security_answer"
  | "other_sensitive"
  | "social_handle"
  | "manual_redaction";

export type AssetCategory = "credential" | "network" | "identifier" | "pii";

export interface AssetPattern {
  type: AssetType;
  label: string;
  category: AssetCategory;
  /** 1 (low) – 10 (critical) */
  severity: number;
  regex: RegExp;
}

/**
 * Every pattern MUST be a global regex so we can scan a full line and find
 * every occurrence. Order matters: earlier patterns win when two matches
 * overlap on the same line (see detectSecrets.ts overlap resolution).
 */
export const PATTERNS: AssetPattern[] = [
  // ── Highest-value / near-zero false positive: key material and full DB creds ──
  {
    // A PEM-format private key header. Presence alone is a critical, unambiguous
    // finding — there's no legitimate reason this is visible in a shared screenshot.
    type: "private_key_block",
    label: "Private Key",
    category: "credential",
    severity: 10,
    regex: /-----BEGIN\s?(RSA|OPENSSH|EC|DSA|PGP)?\s?PRIVATE KEY-----/g,
  },
  {
    type: "database_url",
    label: "Database Connection String",
    category: "credential",
    severity: 9,
    regex: /\b(postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis):\s{0,2}\/\/[^\s'"<>]+/gi,
  },
  {
    // Credentials embedded directly in a URL (https://user:pass@host/...).
    type: "basic_auth_url",
    label: "URL with Embedded Credentials",
    category: "credential",
    severity: 8,
    regex: /\bhttps?:\s{0,2}\/\/[^\s:@/'"]+:[^\s:@/'"]+@[^\s'"<>]+/gi,
  },

  // ── Vendor-specific API keys / tokens (recognizable prefixes → low false-positive rate) ──
  {
    type: "aws_access_key",
    label: "AWS Access Key",
    category: "credential",
    severity: 9,
    regex: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g,
  },
  {
    type: "azure_storage_key",
    label: "Azure Storage Account Key",
    category: "credential",
    severity: 9,
    regex: /\bAccountKey=[A-Za-z0-9+/=]{40,}/g,
  },
  {
    type: "stripe_key",
    label: "Stripe API Key",
    category: "credential",
    severity: 9,
    regex: /\b(?:sk|pk|rk)_(?:live|test)_[A-Za-z0-9]{16,}\b/g,
  },
  {
    type: "github_token",
    label: "GitHub Token",
    category: "credential",
    severity: 8,
    regex: /\bgh[pousr]_[A-Za-z0-9]{36,255}\b/g,
  },
  {
    type: "openai_key",
    label: "OpenAI API Key",
    category: "credential",
    severity: 8,
    regex: /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/g,
  },
  {
    // Covers both the classic Google Cloud API key format (AIzaSy...) and
    // the newer Google AI Studio / Gemini key format (AQ.xxxxx...).
    type: "google_api_key",
    label: "Google / Gemini API Key",
    category: "credential",
    severity: 8,
    regex: /\b(?:AIzaSy[A-Za-z0-9_-]{33}|AQ\.[A-Za-z0-9_-]{20,})\b/g,
  },
  {
    type: "sendgrid_key",
    label: "SendGrid API Key",
    category: "credential",
    severity: 8,
    regex: /\bSG\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}\b/g,
  },
  {
    type: "shopify_token",
    label: "Shopify Access Token",
    category: "credential",
    severity: 8,
    regex: /\bsh(?:pat|pss|pca|ppa)_[a-fA-F0-9]{32}\b/g,
  },
  {
    type: "discord_token",
    label: "Discord Bot Token",
    category: "credential",
    severity: 8,
    regex: /\b[MNO][A-Za-z0-9_-]{23}\.[A-Za-z0-9_-]{6}\.[A-Za-z0-9_-]{27}\b/g,
  },
  {
    type: "digitalocean_token",
    label: "DigitalOcean Token",
    category: "credential",
    severity: 8,
    regex: /\bdop_v1_[a-f0-9]{64}\b/g,
  },
  {
    type: "telegram_bot_token",
    label: "Telegram Bot Token",
    category: "credential",
    severity: 8,
    regex: /\b\d{8,10}:[A-Za-z0-9_-]{35}\b/g,
  },
  {
    type: "slack_token",
    label: "Slack Token",
    category: "credential",
    severity: 7,
    regex: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g,
  },
  {
    type: "slack_webhook",
    label: "Slack Webhook URL",
    category: "credential",
    severity: 7,
    regex: /\bhttps:\s{0,2}\/\/hooks\.slack\.com\/services\/T[A-Za-z0-9]+\/B[A-Za-z0-9]+\/[A-Za-z0-9]+\b/g,
  },
  {
    type: "twilio_key",
    label: "Twilio API Key",
    category: "credential",
    severity: 7,
    regex: /\bSK[a-f0-9]{32}\b/gi,
  },
  {
    type: "npm_token",
    label: "npm Token",
    category: "credential",
    severity: 7,
    regex: /\bnpm_[A-Za-z0-9]{36}\b/g,
  },
  {
    type: "dockerhub_token",
    label: "Docker Hub Token",
    category: "credential",
    severity: 7,
    regex: /\bdckr_pat_[A-Za-z0-9_-]{27}\b/g,
  },
  {
    type: "discord_webhook",
    label: "Discord Webhook URL",
    category: "credential",
    severity: 6,
    regex: /\bhttps:\s{0,2}\/\/discord(?:app)?\.com\/api\/webhooks\/\d+\/[\w-]+\b/g,
  },
  {
    // Generic "Authorization: Bearer <token>" header, common in screenshots
    // of Postman/curl/dev tools. Lower confidence than named vendors since
    // the token itself isn't in a recognizable format.
    type: "bearer_token",
    label: "Bearer Token",
    category: "credential",
    severity: 6,
    regex: /\bBearer\s+[A-Za-z0-9\-_.]{20,}\b/gi,
  },
  {
    // Catch-all fallback for the general "SOME_KEY=value" / "SOME_SECRET: value"
    // shape (.env files, config screenshots) that isn't a known vendor
    // format above. Lower severity than the specific patterns so a specific
    // match wins when both overlap the same span on a line.
    type: "generic_secret_assignment",
    label: "Possible Secret (KEY=value)",
    category: "credential",
    severity: 6,
    // Case-insensitive: OCR on small/anti-aliased editor text intermittently
    // flips individual character case (env var names are almost always
    // uppercase in source, but that's not guaranteed to survive OCR), and a
    // missed key name here means the whole finding — and the redaction —
    // silently disappears. Under-matching is a much worse failure mode for
    // this tool than the rare false positive.
    regex:
      /\b[A-Z][A-Z0-9_]*(?:_KEY|_SECRET|_TOKEN|_PASSWORD|_PASSWD|_PWD|_CREDENTIAL)S?\b\s*[:=]\s*["']?([^\s"']{10,})["']?/gi,
  },
  {
    type: "jwt",
    label: "JWT",
    category: "credential",
    severity: 6,
    regex: /\bey[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
  },
  {
    // The distinctive "type": "service_account" field from an exported GCP
    // service-account JSON key file. Matching this line alone is enough to
    // flag the finding even though the actual private_key field elsewhere
    // in the file is separately caught by the private_key_block pattern.
    type: "gcp_service_account_key",
    label: "GCP Service Account Key File",
    category: "credential",
    severity: 10,
    regex: /"type"\s*:\s*"service_account"/g,
  },
  {
    type: "ethereum_private_key",
    label: "Ethereum Private Key",
    category: "credential",
    severity: 9,
    regex: /\b0x[a-fA-F0-9]{64}\b/g,
  },
  {
    type: "square_token",
    label: "Square Access Token",
    category: "credential",
    severity: 8,
    regex: /\bsq0(?:atp|csp)-[A-Za-z0-9_-]{22,43}\b/g,
  },
  {
    type: "paypal_braintree_token",
    label: "PayPal/Braintree Access Token",
    category: "credential",
    severity: 8,
    regex: /\baccess_token\$production\$[a-z0-9]+\$[a-f0-9]{32}\b/gi,
  },
  {
    type: "mailchimp_api_key",
    label: "Mailchimp API Key",
    category: "credential",
    severity: 7,
    regex: /\b[a-f0-9]{32}-us\d{1,2}\b/g,
  },

  // ── Network exposure ──
  {
    // internal-looking URL: localhost, .local, staging/admin/internal subdomains, private hosts
    type: "internal_url",
    label: "Internal URL",
    category: "network",
    severity: 6,
    regex:
      /\bhttps?:\s{0,2}\/\/(?:[a-z0-9-]*\.)*(?:localhost|[a-z0-9-]*(?:internal|staging|admin|dev|test)[a-z0-9-]*\.[a-z]{2,}|[a-z0-9-]+\.local)(?::\d+)?[^\s'"<>)]*/gi,
  },
  {
    type: "url",
    label: "URL",
    category: "network",
    severity: 2,
    regex: /\bhttps?:\s{0,2}\/\/[^\s'"<>)]+/gi,
  },
  {
    // RFC1918 private ranges — flagged higher, they leak internal network topology
    type: "internal_ip",
    label: "Internal IP Address",
    category: "network",
    severity: 5,
    regex:
      /\b(?:10\.(?:\d{1,3}\.){2}\d{1,3}|192\.168\.(?:\d{1,3}\.)\d{1,3}|172\.(?:1[6-9]|2\d|3[0-1])\.(?:\d{1,3}\.)\d{1,3}|127\.(?:\d{1,3}\.){2}\d{1,3})\b/g,
  },
  {
    type: "ip_address",
    label: "IP Address",
    category: "network",
    severity: 3,
    regex: /\b(?:(?:25[0-5]|2[0-4]\d|1?\d{1,2})\.){3}(?:25[0-5]|2[0-4]\d|1?\d{1,2})\b/g,
  },
  {
    type: "mac_address",
    label: "MAC Address",
    category: "network",
    severity: 3,
    regex: /\b(?:[0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}\b/g,
  },

  // ── Personal / financial information ──
  {
    // Allows the common human-readable groupings (spaces or dashes), not
    // just a raw digit run — screenshots almost never show a card number
    // as one unbroken string.
    type: "credit_card",
    label: "Credit Card Number",
    category: "pii",
    severity: 7,
    regex:
      /\b(?:4\d{3}[ -]?\d{4}[ -]?\d{4}[ -]?\d{4}|5[1-5]\d{2}[ -]?\d{4}[ -]?\d{4}[ -]?\d{4}|3[47]\d{2}[ -]?\d{6}[ -]?\d{5}|6(?:011|5\d{2})[ -]?\d{4}[ -]?\d{4}[ -]?\d{4})\b/g,
  },
  {
    // US Social Security Number format only — this is a pattern-shape match,
    // not validated against real SSA issuance rules, so treat confidence accordingly.
    type: "ssn",
    label: "Social Security Number",
    category: "pii",
    severity: 6,
    regex: /\b\d{3}-\d{2}-\d{4}\b/g,
  },
  {
    type: "email",
    label: "Email Address",
    category: "pii",
    severity: 3,
    regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
  },
  {
    // NANP/international-style grouping (3-3-4 or similar) with explicit
    // separators between every group. Deliberately does NOT match bare
    // digit runs with no separators — that shape is indistinguishable from
    // order IDs, timestamps, etc., and the false-positive cost of a bare
    // 10-digit matcher outweighs catching a handful of unformatted numbers.
    type: "phone_number",
    label: "Phone Number",
    category: "pii",
    severity: 4,
    regex: /\b(?:\+\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}\b/g,
  },
  {
    // IBAN structure (2-letter country code + 2 check digits + up to 30
    // alphanumeric) is specific enough on its own to be low-noise.
    type: "iban",
    label: "IBAN",
    category: "pii",
    severity: 6,
    regex: /\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/g,
  },
  {
    // 17-char VIN, excludes I/O/Q per the ISO 3779 standard.
    type: "vin",
    label: "Vehicle Identification Number",
    category: "pii",
    severity: 3,
    regex: /\b[A-HJ-NPR-Z0-9]{17}\b/g,
  },
  {
    // Keyword-anchored rather than a bare digit/letter pattern — passport
    // number formats vary too much by country to match reliably on shape
    // alone without a very high false-positive rate.
    type: "passport_number",
    label: "Passport Number",
    category: "pii",
    severity: 6,
    regex: /\bpassport\s*(?:no\.?|number|#)?\s*[:\-]?\s*[A-Z0-9]{6,9}\b/gi,
  },
  {
    // Keyword-anchored (DOB / Date of Birth / Born) for the same reason —
    // a bare date pattern alone is far too common (any date on a screen) to
    // safely treat as sensitive without a birth-date-specific label nearby.
    type: "date_of_birth",
    label: "Date of Birth",
    category: "pii",
    severity: 5,
    regex: /\b(?:DOB|Date of Birth|Born)\s*[:\-]?\s*\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4}\b/gi,
  },
  {
    // Social/app handles: "@word". This is a structural PII gap the NER
    // model misses constantly — a handle isn't a "name" in the linguistic
    // sense a general-purpose NER model was trained to recognize, but it's
    // exactly as identifying. Regex catches the shape deterministically
    // instead of depending on model confidence.
    //
    // Requires the "@" prefix. An earlier version of this pattern also
    // matched any bare word containing an underscore with no "@" required,
    // intended to catch handles like "mk.dass_offlx" written without the
    // "@". In practice that alternative matched *any* snake_case token —
    // env var names (GEMINI_MODEL, GEMINI_API_KEY), code identifiers,
    // filenames — and over-flagged constantly on code/config screenshots.
    // The "@" requirement is a hard requirement, not just a low-noise
    // preference: without it this pattern is indistinguishable from "word
    // contains an underscore," which is true of most source code.
    type: "social_handle",
    label: "Social Media Handle",
    category: "identifier",
    severity: 3,
    // Only match @-prefixed handles. The previous version also matched any
    // bare word containing an underscore with no @ required, which fired on
    // every snake_case identifier — env var names (GEMINI_MODEL,
    // GEMINI_API_KEY), code variables, folder names, etc. — in any source
    // code or config screenshot, blurring plainly non-sensitive content.
    regex: /@[A-Za-z0-9._]{2,30}\b/g,
  },
];

export function severityBand(score: number): "low" | "medium" | "critical" {
  if (score >= 60) return "critical";
  if (score >= 30) return "medium";
  return "low";
}

export function bandColorVar(band: "low" | "medium" | "critical") {
  if (band === "critical") return "var(--red)";
  if (band === "medium") return "var(--amber)";
  return "var(--green)";
}

/** 4-tier version (adds "high") for the richer impact/confidence fields
 * introduced by the attacker-simulation upgrade (leak-chain node risk,
 * business-impact breakdown, share-destination risk). */
export function impactColorVar(level: "low" | "medium" | "high" | "critical") {
  if (level === "critical") return "var(--red)";
  if (level === "high") return "var(--orange)";
  if (level === "medium") return "var(--amber)";
  return "var(--green)";
}