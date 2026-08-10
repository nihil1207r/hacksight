import type { AssetMetadata } from "./metadata";
import type { SimulationResponse, AssetSimulation, ChainSimulation, ImpactLevel } from "./simulationTypes";
import { getDestination, DestinationId } from "./destinations";

/**
 * Short, honest technical grounding per asset type so the model explains
 * realistic consequences instead of inventing dramatic but impossible ones.
 * This is the only "domain knowledge" the model gets beyond the metadata
 * itself — it never sees the actual secret value.
 */
const ASSET_KNOWLEDGE: Record<string, string> = {
  aws_access_key:
    "An AWS access key ID alone does not reveal permissions. A realistic attacker would use it to call low-privilege read-only AWS APIs (e.g. sts:GetCallerIdentity, iam:ListAttachedUserPolicies) to enumerate what it can actually do before attempting anything further. Impact ranges from nothing (if disabled/scoped tightly) to full account compromise (if it's a long-lived key with broad IAM permissions).",
  openai_key:
    "An exposed OpenAI API key is typically billed to the owner's account. Realistic abuse is usage/billing fraud (running expensive completions on the victim's dime) or using it to exfiltrate data the key's associated project has access to via retrieval/tools, not a direct system compromise.",
  google_api_key:
    "A Google / Gemini API key is typically billed to the owner's project and may be scoped to specific APIs. Realistic abuse is usage/billing fraud (running expensive generation calls on the victim's dime) or, if the key is unrestricted, calling other Google APIs enabled on that project. Impact depends heavily on whether the key has application/IP restrictions configured.",
  stripe_key:
    "A Stripe secret key grants direct API access to the account's payment operations (charges, refunds, customer data) — this is a severe, direct financial and PII exposure, not just reconnaissance. A live-mode key is far worse than a test-mode key.",
  slack_token:
    "A Slack token's impact depends on scope, but realistically enables reading messages/files in channels the token can access, posting as the associated user/bot, or enumerating workspace members — useful for both data exfiltration and social engineering setup.",
  slack_webhook:
    "A Slack incoming webhook URL only allows posting messages into one preconfigured channel — it cannot read messages or access other channels. Realistic abuse is spam or convincing phishing messages that appear to come from a trusted internal bot.",
  discord_token:
    "A Discord bot token lets an attacker act as that bot in every server it's been added to — reading/sending messages, and depending on permissions, kicking/banning members or managing channels. Impact scales with how many servers the bot is in and its role permissions.",
  discord_webhook:
    "A Discord webhook URL only allows posting messages to one channel, similar to a Slack webhook. Low direct risk beyond spam or impersonation-style phishing in that channel.",
  telegram_bot_token:
    "A Telegram bot token lets an attacker fully control that bot — reading messages sent to it, sending messages to any chat it's part of, and reading its message history via the Bot API. Impact depends on what the bot is connected to (e.g. does it relay commands to internal systems).",
  twilio_key:
    "A Twilio API key can typically send/receive SMS and make calls billed to the account, and may expose call/message logs depending on scope. Realistic abuse is billing fraud (premium-rate SMS abuse) or using it for OTP-interception style attacks if the account handles 2FA codes.",
  sendgrid_key:
    "A SendGrid API key typically allows sending email as the verified sender identity — realistic abuse is large-scale phishing or spam sent from a domain with real sending reputation, which is more effective than spoofing and can get the domain blocklisted.",
  npm_token:
    "An npm publish token allows pushing new versions of packages the account maintains — a realistic and severe supply-chain risk if it's a publish-scoped token, since a malicious version could reach every downstream consumer of that package.",
  shopify_token:
    "A Shopify access token's impact depends on granted scopes, but can realistically expose customer PII and order data, or allow modifying store content/pricing if write scopes are included.",
  digitalocean_token:
    "A DigitalOcean personal access token can, depending on scope, create/destroy droplets and read account resources — realistic abuse ranges from spinning up cryptomining droplets billed to the victim to full infrastructure takeover if the token is unrestricted.",
  dockerhub_token:
    "A Docker Hub access token can push images to the account's repositories if write-scoped — a supply-chain risk if anyone pulls `latest` from an affected image, similar in shape to an npm token leak.",
  azure_storage_key:
    "An Azure Storage account key grants full read/write/delete access to every container and blob in that storage account — functionally equivalent to a database credential leak, with no way to scope it down after the fact short of rotation.",
  private_key_block:
    "A private key (SSH/TLS/PGP) is a direct authentication credential, not just a hint of one — if this key is used anywhere reachable, an attacker who obtains the full key body can authenticate as its owner. Note: metadata here only confirms a private-key header was visible, not whether the full key body was also exposed in the screenshot.",
  basic_auth_url:
    "A URL with a username:password embedded directly in it is a complete, ready-to-use credential pair, not just a hint — no additional guessing or enumeration needed if the host is reachable.",
  bearer_token:
    "A bearer token found without a recognizable vendor format is a live authenticated session for whatever API issued it. It's real access, but the metadata alone can't say to what — an attacker's realistic first move is replaying it against whatever endpoint it was captured near.",
  credit_card:
    "A credit card number by itself (no CVV/expiry confirmed from metadata) has limited direct usability for card-not-present fraud, but is still PCI-sensitive data whose exposure carries compliance and reputational consequences regardless of exploitability.",
  ssn:
    "A Social Security Number is a durable identity credential used for identity verification well beyond this one context — realistic abuse is identity theft and fraud (opening credit lines, tax fraud), not a direct technical compromise.",
  generic_secret_assignment:
    "This was flagged by its shape (a KEY=value or KEY: value assignment with a credential-like name) rather than a known vendor format, so its real capability is unknown from metadata alone. Treat conservatively: assume it grants some form of authenticated access until proven otherwise.",
  github_token:
    "Impact depends entirely on token scope, which isn't visible from a screenshot. A realistic attacker assumes worst-case (repo + workflow scope) and would attempt to clone private repositories or push a malicious commit/workflow if the scope allows it.",
  jwt: "A JWT found in a screenshot is a captured token, not a forgeable secret (forging one requires the signing key, which is separate). A realistic attacker's move is replaying the token against the API it authenticates to, until it expires or is revoked. Impact depends entirely on what the token authorizes.",
  database_url:
    "A full connection string with embedded credentials is a direct, unauthenticated-to-the-attacker path to the database if the host is reachable from the public internet. If the host is only reachable from an internal network, the realistic first step is confirming reachability before anything else.",
  internal_ip:
    "An internal (RFC1918) IP address is not reachable from the public internet by itself. Its realistic value to an attacker is reconnaissance — it reveals internal network layout, which is useful only if the attacker already has another foothold inside the network.",
  ip_address:
    "A bare public IP address on its own enables reconnaissance (port scanning, service fingerprinting) but is not a credential and grants no direct access.",
  internal_url:
    "An internal-looking URL (staging/admin/local hostname) suggests infrastructure not meant for public discovery. Realistic value to an attacker is as a target for further probing — trying default credentials, checking for missing auth — not automatic access.",
  url: "A plain public URL is normally low risk on its own. It only matters if it points to something unintentionally exposed (an admin panel, a debug endpoint) — call this out only if the environment/context suggests it, otherwise treat it as low severity.",
  email:
    "An exposed email address is primarily useful for social engineering (phishing, credential-stuffing target list) and OSINT, not direct technical compromise.",
  gcp_service_account_key:
    "A GCP service account key file grants programmatic access to every GCP resource the account's IAM role permits — potentially full project control. This is equivalent in severity to a leaked cloud root credential.",
  ethereum_private_key:
    "An Ethereum private key gives complete, irreversible control of that wallet's funds and any on-chain identity tied to it. Unlike most credentials, there is no 'rotation' — an attacker who obtains it can drain the wallet immediately and permanently.",
  square_token:
    "A Square access token can process payments, refunds, and access transaction/customer data for the connected merchant account, depending on granted scopes — a direct financial and PII exposure.",
  paypal_braintree_token:
    "A PayPal/Braintree production access token allows initiating real payment transactions and accessing merchant account data — a direct financial exposure similar in severity to a Stripe key.",
  mailchimp_api_key:
    "A Mailchimp API key exposes the account's audience/subscriber lists (PII) and allows sending campaigns as the account — realistic abuse is data exfiltration of the mailing list or reputation-damaging spam.",
  mac_address:
    "A MAC address identifies a specific network device but is not routable or usable beyond the local network segment. Low value to a remote attacker on its own; mainly useful for device fingerprinting if paired with other data.",
  iban:
    "An IBAN alone allows someone to receive or initiate transfers to/from that account in most banking systems, but typically cannot be used to withdraw funds without additional authentication. Still sensitive financial PII with compliance implications.",
  vin:
    "A Vehicle Identification Number enables looking up ownership history, recalls, and — combined with other exposed PII — can support vehicle-related fraud or theft (e.g. fraudulent duplicate key/title requests). Not independently exploitable.",
  passport_number:
    "A passport number is a durable government identity credential. Realistic abuse is identity theft, fraudulent document applications, or travel/visa fraud when combined with other exposed PII — not a direct technical compromise.",
  date_of_birth:
    "A date of birth alone has limited abuse potential, but is a key component of identity verification and, combined with a name or SSN also visible in the same screenshot, meaningfully increases identity-theft risk.",
  person_name:
    "A person's name alone is low direct risk but is the anchor other exposed info (email, address, employer) attaches to, turning otherwise-generic data into a targeted profile useful for social engineering.",
  physical_address:
    "A physical address enables real-world targeting: harassment, unwanted visits, or convincing physical/social-engineering pretexts referencing a real location.",
  employer_or_workplace:
    "Knowing where a specific named person works enables targeted phishing (impersonating a colleague or IT department) and narrows down which systems/credentials would be worth targeting next.",
  family_relation:
    "A named family member is commonly used as a security-question answer or social-engineering pretext (e.g. impersonating a relative in an urgent-help scam).",
  account_identifier:
    "An account/username/employee ID isn't authentication on its own, but is the first input an attacker needs for credential stuffing, password reset flows, or impersonation attempts.",
  security_answer:
    "A visible security-question answer or password is functionally a live credential — realistic abuse is direct account takeover via password/account-recovery flows.",
  other_sensitive:
    "Flagged as sensitive by context rather than a known category — treat conservatively since its specific exploitability isn't captured by a standard asset type.",
};

function buildPrompt(metadata: AssetMetadata[], destinationId?: DestinationId | null): string {
  const assetLines = metadata
    .map(
      (m) =>
        `- id: ${m.id} | type: ${m.assetType} | category: ${m.category} | environment: ${m.environment} | visibility: ${m.visibility} | severity_hint: ${m.severityHint} | length: ${m.characterCount} chars\n  context: ${ASSET_KNOWLEDGE[m.assetType] ?? "No special notes for this asset type."}`
    )
    .join("\n");

  const credentialCount = metadata.filter((m) => m.category === "credential").length;

  const destination = getDestination(destinationId);
  const destinationBlock = destination
    ? `\nThe user plans to share this on ${destination.label} (${destination.tagline}). Destination risk tier: ${destination.risk}. ${destination.detail} Factor this into likelihood, attackSuccessProbability, and timeToExploit — the same exposure is far more dangerous posted somewhere public and permanent than sent to one known recipient.`
    : `\nThe user hasn't said where they plan to share this — assume a generic public posting for likelihood purposes, and note that uncertainty in your confidence reasoning.`;

  return `You are an experienced security consultant doing a fast desk review of what was found in a developer's screenshot BEFORE it gets published. Write each asset's "summary" in first person, from the attacker's point of view — start it with "If I were an attacker, I would..." — but stay factual and professional, not theatrical. This is a controlled, third-party review, not a real threat actor.

You have ONLY the metadata below. You do NOT have the actual secret values, the screenshot, or any other context. Never assume capabilities an asset type does not realistically have — a "context" note is provided for each asset type to keep you grounded. If an asset is genuinely low risk, say so plainly instead of manufacturing drama. Do not invent specific company names, real breach precedents, fabricated dollar figures, or technical details you cannot justify from the asset type alone.

Detected assets (metadata only):
${assetLines}

There are ${credentialCount} credential-category asset(s) among these.
${destinationBlock}

For EACH asset, produce an attacker-simulation object with:
- summary: 1-2 sentences, first person ("If I were an attacker, I would...").
- steps: an ordered array of 3-5 attack-chain nodes, each with a short "name" (2-4 words, e.g. "Enumerate IAM permissions"), a one-sentence "description", and a "risk" level (low/medium/high/critical) for that specific step.
- likelihood (low/medium/high) that this specific exposure gets exploited if shared as described.
- difficulty (trivial/moderate/advanced) for carrying out the full chain.
- timeToExploit: a plain-language estimate — prefer phrasing like "immediate", "under 5 minutes", "within 30 minutes", "several hours", or "unknown" if it genuinely depends on unknowable factors.
- attackSuccessProbability: an integer 0-100 for how likely a competent attacker actually succeeds via this path, given the destination context.
- estimatedDamage: 1 short plain-language sentence on realistic damage scale (e.g. "Limited to this one service" or "Could cascade to connected systems") — never a fabricated dollar amount.
- businessImpact: 1-2 sentence overall business impact summary.
- businessImpactBreakdown: rate each of financialLoss, operationalDowntime, customerImpact, complianceRisk, reputationDamage as low/medium/high/critical. Most assets will NOT be critical across the board — vary these honestly based on what the asset type actually threatens (e.g. a bare email address has near-zero operationalDowntime risk).
- recommendations: 2-4 concrete fixes.
- confidence: an integer 0-100 for how confident you are in this specific assessment, given you only have metadata.
- confidenceReasons: 1-3 short bullet reasons for that confidence level (e.g. "Production environment", "Full visibility, no redaction", "Token scope unknown from metadata alone"). If confidence is below ~60, one reason must explain what's missing that would raise it. Never state confidence as certainty you don't actually have.

ALSO produce one "attackChain" object considering whether two or more of these assets could realistically be COMBINED by the same attacker into a worse outcome than any single asset alone. Set chainPossible to false — and keep other fields minimal, saying plainly that no meaningful chain exists — if there are fewer than 2 credential-category assets, or if the assets genuinely don't combine into anything worse. Only set chainPossible to true with a real chained narrative (its own steps/summary/etc, same shape as above) if it is genuinely realistic.

Respond with JSON only, matching the provided schema exactly.`;
}

const likelihoodEnum = ["low", "medium", "high"];
const difficultyEnum = ["trivial", "moderate", "advanced"];
const impactEnum = ["low", "medium", "high", "critical"];

const stepNodeSchema = {
  type: "object",
  properties: {
    name: { type: "string" },
    description: { type: "string" },
    risk: { type: "string", enum: impactEnum },
  },
  required: ["name", "description", "risk"],
};

const businessImpactBreakdownSchema = {
  type: "object",
  properties: {
    financialLoss: { type: "string", enum: impactEnum },
    operationalDowntime: { type: "string", enum: impactEnum },
    customerImpact: { type: "string", enum: impactEnum },
    complianceRisk: { type: "string", enum: impactEnum },
    reputationDamage: { type: "string", enum: impactEnum },
  },
  required: ["financialLoss", "operationalDowntime", "customerImpact", "complianceRisk", "reputationDamage"],
};

const simulationFields = {
  summary: { type: "string" },
  steps: { type: "array", items: stepNodeSchema },
  likelihood: { type: "string", enum: likelihoodEnum },
  difficulty: { type: "string", enum: difficultyEnum },
  timeToExploit: { type: "string" },
  businessImpact: { type: "string" },
  businessImpactBreakdown: businessImpactBreakdownSchema,
  recommendations: { type: "array", items: { type: "string" } },
  attackSuccessProbability: { type: "integer" },
  estimatedDamage: { type: "string" },
  confidence: { type: "integer" },
  confidenceReasons: { type: "array", items: { type: "string" } },
};

const simulationRequiredFields = Object.keys(simulationFields);

function buildSchema() {
  return {
    type: "object",
    properties: {
      assets: {
        type: "array",
        items: {
          type: "object",
          properties: {
            assetId: { type: "string" },
            ...simulationFields,
          },
          required: ["assetId", ...simulationRequiredFields],
        },
      },
      attackChain: {
        type: "object",
        properties: {
          chainPossible: { type: "boolean" },
          ...simulationFields,
        },
        required: ["chainPossible", ...simulationRequiredFields],
      },
    },
    required: ["assets", "attackChain"],
  };
}

function isValidImpact(v: unknown): v is ImpactLevel {
  return typeof v === "string" && impactEnum.includes(v);
}

function isValidStep(v: unknown): boolean {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return typeof o.name === "string" && typeof o.description === "string" && isValidImpact(o.risk);
}

function isValidBreakdown(v: unknown): boolean {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    isValidImpact(o.financialLoss) &&
    isValidImpact(o.operationalDowntime) &&
    isValidImpact(o.customerImpact) &&
    isValidImpact(o.complianceRisk) &&
    isValidImpact(o.reputationDamage)
  );
}

function clampInt(v: unknown, fallback: number): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function isValidSimulation(v: unknown): v is AssetSimulation | ChainSimulation {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.summary === "string" &&
    Array.isArray(o.steps) &&
    o.steps.every(isValidStep) &&
    likelihoodEnum.includes(o.likelihood as string) &&
    difficultyEnum.includes(o.difficulty as string) &&
    typeof o.timeToExploit === "string" &&
    typeof o.businessImpact === "string" &&
    isValidBreakdown(o.businessImpactBreakdown) &&
    Array.isArray(o.recommendations) &&
    typeof o.estimatedDamage === "string" &&
    Array.isArray(o.confidenceReasons)
  );
}

function normalize(parsed: unknown, metadata: AssetMetadata[]): SimulationResponse {
  const obj = (parsed ?? {}) as Record<string, unknown>;
  const rawAssets = Array.isArray(obj.assets) ? obj.assets : [];
  const knownIds = new Set(metadata.map((m) => m.id));

  const assets: AssetSimulation[] = rawAssets
    .filter(
      (a): a is Record<string, unknown> =>
        !!a && typeof a === "object" && typeof (a as Record<string, unknown>).assetId === "string" && isValidSimulation(a)
    )
    .filter((a) => knownIds.has(a.assetId as string))
    .map((a) => ({
      ...(a as unknown as AssetSimulation),
      attackSuccessProbability: clampInt(a.attackSuccessProbability, 50),
      confidence: clampInt(a.confidence, 50),
    }));

  let attackChain: ChainSimulation | null = null;
  if (obj.attackChain && typeof obj.attackChain === "object" && isValidSimulation(obj.attackChain)) {
    const c = obj.attackChain as unknown as Record<string, unknown>;
    attackChain = {
      ...(c as unknown as ChainSimulation),
      chainPossible: Boolean(c.chainPossible),
      attackSuccessProbability: clampInt(c.attackSuccessProbability, 50),
      confidence: clampInt(c.confidence, 50),
    };
  }

  return { assets, attackChain };
}

export async function runAttackSimulation(
  metadata: AssetMetadata[],
  destinationId?: DestinationId | null
): Promise<SimulationResponse> {
  const hasGemini = !!process.env.GEMINI_API_KEY;
  const hasOpenRouter = !!process.env.OPENROUTER_API_KEY;

  if (!hasGemini && !hasOpenRouter) {
    throw new Error(
      "No AI provider is configured. Add GEMINI_API_KEY and/or OPENROUTER_API_KEY to .env.local to enable attacker simulation."
    );
  }

  // Both keys can be set at once: whichever provider is tried first, if it
  // fails for ANY reason (network block, quota, outage, bad response), we
  // automatically retry with the other one before giving up. This is what
  // makes having both configured actually more reliable than either alone —
  // a network block on generativelanguage.googleapis.com specifically, for
  // example, doesn't take down the whole feature if OpenRouter still works.
  const providers: Array<{ name: string; run: () => Promise<SimulationResponse> }> = [];
  const available: Record<string, { name: string; run: () => Promise<SimulationResponse> }> = {
    gemini: { name: "Gemini", run: () => callGemini(metadata, destinationId) },
    openrouter: { name: "OpenRouter", run: () => callOpenRouter(metadata, destinationId) },
  };

  // Order is configurable (SIMULATION_PROVIDER_ORDER="openrouter,gemini"),
  // defaulting to Gemini first. Only providers with a key actually set are included.
  const orderPref = (process.env.SIMULATION_PROVIDER_ORDER || "gemini,openrouter")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s in available);
  for (const key of orderPref) {
    if (key === "gemini" && !hasGemini) continue;
    if (key === "openrouter" && !hasOpenRouter) continue;
    providers.push(available[key]);
  }

  const failures: string[] = [];
  for (const provider of providers) {
    try {
      return await provider.run();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      failures.push(`${provider.name}: ${msg}`);
    }
  }

  throw new Error(
    providers.length > 1
      ? `All configured providers failed.\n- ${failures.join("\n- ")}`
      : failures[0]
  );
}

async function callGemini(metadata: AssetMetadata[], destinationId?: DestinationId | null): Promise<SimulationResponse> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set.");
  const model = process.env.GEMINI_MODEL || "gemini-3.5-flash";

  let res: Response;
  try {
    res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: buildPrompt(metadata, destinationId) }] }],
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema: buildSchema(),
            temperature: 0.4,
          },
        }),
      }
    );
  } catch (err) {
    // fetch() rejects (rather than resolving with a bad status) for
    // connection-level failures: DNS resolution, connection refused, TLS
    // handshake, or the request being blocked by a firewall/proxy before it
    // ever reaches Google. This is a NETWORK problem, not an API-key
    // problem — Node's fetch nests the real reason in `err.cause`, which the
    // top-level "fetch failed" message otherwise hides.
    const cause = err instanceof Error && "cause" in err ? (err.cause as { code?: string; message?: string } | undefined) : undefined;
    const causeDetail = cause?.code ?? cause?.message;
    throw new Error(
      `Could not reach generativelanguage.googleapis.com${causeDetail ? ` (${causeDetail})` : ""}.`
    );
  }

  if (!res.ok) {
    const bodyText = await res.text().catch(() => "");
    throw new Error(`Gemini API error (${res.status}): ${bodyText.slice(0, 300)}`);
  }

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text || typeof text !== "string") {
    throw new Error("Gemini returned no usable content.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Gemini response was not valid JSON.");
  }

  return normalize(parsed, metadata);
}

/** Recursively adds `additionalProperties: false` to every object-typed
 * subschema. OpenRouter's strict structured-output mode (and most of the
 * underlying providers it routes to) requires this explicitly — Gemini's
 * responseSchema format doesn't use/want this field, which is why it's kept
 * as a separate transform rather than baked into buildSchema() itself. */
function toStrictJsonSchema(schema: unknown): unknown {
  if (!schema || typeof schema !== "object") return schema;
  const s = schema as Record<string, unknown>;
  const out: Record<string, unknown> = { ...s };

  if (out.properties && typeof out.properties === "object") {
    const props = out.properties as Record<string, unknown>;
    out.properties = Object.fromEntries(Object.entries(props).map(([k, v]) => [k, toStrictJsonSchema(v)]));
  }
  if (out.items) {
    out.items = toStrictJsonSchema(out.items);
  }
  if (out.type === "object") {
    out.additionalProperties = false;
  }
  return out;
}

async function callOpenRouter(metadata: AssetMetadata[], destinationId?: DestinationId | null): Promise<SimulationResponse> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is not set.");
  // Defaults to a strong, structured-output-capable model that's a
  // different vendor than Gemini — genuine redundancy, not just a second
  // route to the same underlying model.
  const model = process.env.OPENROUTER_MODEL || "openai/gpt-4.1-mini";

  let res: Response;
  try {
    res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        // Optional but recommended by OpenRouter for their own analytics/rankings — harmless if inaccurate.
        "HTTP-Referer": "https://hacksight.local",
        "X-Title": "HackSight",
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: buildPrompt(metadata, destinationId) }],
        temperature: 0.4,
        // Without an explicit cap, OpenRouter pre-flight-checks affordability
        // against the model's full max-output ceiling (65536 for
        // gpt-4.1-mini) rather than what this request will actually use,
        // which can 402 an account that has plenty of credit for the real
        // response size. The structured findings/attack-chain payload this
        // schema produces comfortably fits well under this cap even for the
        // largest realistic finding counts; override with
        // OPENROUTER_MAX_TOKENS if a given account/model needs headroom.
        max_tokens: Number(process.env.OPENROUTER_MAX_TOKENS) || 8000,
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "hacksight_simulation",
            strict: true,
            schema: toStrictJsonSchema(buildSchema()),
          },
        },
      }),
    });
  } catch (err) {
    const cause = err instanceof Error && "cause" in err ? (err.cause as { code?: string; message?: string } | undefined) : undefined;
    const causeDetail = cause?.code ?? cause?.message;
    throw new Error(`Could not reach openrouter.ai${causeDetail ? ` (${causeDetail})` : ""}.`);
  }

  if (!res.ok) {
    const bodyText = await res.text().catch(() => "");
    throw new Error(`OpenRouter API error (${res.status}): ${bodyText.slice(0, 300)}`);
  }

  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content;
  if (!text || typeof text !== "string") {
    throw new Error("OpenRouter returned no usable content.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("OpenRouter response was not valid JSON.");
  }

  return normalize(parsed, metadata);
}