# HackSight AI

**See your screenshot through a hacker's eyes.**

HackSight AI is a local-first security checkpoint that analyzes screenshots
before you share them publicly — on GitHub, Reddit, Discord, Stack Overflow,
bug reports, or a hackathon submission. Unlike a typical secret scanner that
just says "API key found," HackSight explains what an attacker could
realistically *do* with what's exposed, then hands you back a sanitized
version of the same image.

The whole product answers one question: **is this screenshot safe to share?**

---

## How it works

```
Screenshot → Local OCR → Secret Detection (regex + on-device AI) → Metadata → Attack Simulation → Safe Screenshot
```

OCR, regex-based detection, and semantic detection (names, orgs, locations)
all happen entirely in your browser via a local model — your screenshot and
any secret values it contains are never uploaded for that part of the
pipeline. Two things can leave your machine, both opt-in:

1. **Attacker simulation metadata** — a small, structured object per
   detected finding (asset type, category, environment guess, visibility,
   severity hint). No raw values, no OCR text, no image data. Required for
   the attacker simulation feature.
2. **Cloud semantic scan** *(optional, off by default even when Deep Scan is
   on)* — if you explicitly enable it, the raw OCR'd text (not the image) is
   sent to an LLM as a second, more thorough pass on top of the on-device
   model. A real trade-off, not free — see [Semantic scan](#semantic-scan)
   below.

| Stage | Where it runs | What it does |
|---|---|---|
| OCR | Browser (Tesseract.js) | Reads text + word bounding boxes from the image |
| Regex secret detection | Browser (`lib/patterns.ts`) | Flags ~40 structured patterns: cloud/API credentials, database URLs, private keys, JWTs, IPs, IBANs, VINs, phone numbers, and more |
| On-device semantic scan | Browser (`lib/localSemanticScan.ts`, transformers.js/WASM) | Local NER model catches unstructured PII regex can't — names, orgs, location mentions. Nothing leaves the device. |
| Cloud semantic scan *(optional, nested under Deep Scan)* | Server → LLM via OpenRouter | Second, more thorough pass over the same gap — addresses, family, security answers, account IDs |
| Risk scoring | Browser | Turns findings into a Safe-to-Share % (0–100) |
| Metadata generation | Browser | Strips every finding down to type/category/environment/severity — no raw values |
| Share destination | You pick (optional) | Where you plan to post it — factored into likelihood and urgency |
| Attack simulation | Server → Gemini and/or OpenRouter | First-person attacker narrative, leak-chain nodes, confidence, success probability, 5-category business impact breakdown |
| Remediation | Browser (`lib/remediation.ts`) | Per finding: a rotate/revoke link to the issuing provider's dashboard, plus a `git filter-repo` template if it's the kind of secret that ends up committed |
| Safe screenshot | Browser (Canvas) | Permanently pixelates each flagged region and offers it for download/share |

## Detection coverage

**Regex library** (`lib/patterns.ts`), fully local, zero network calls:

- **Credentials** — AWS, GCP service account keys, OpenAI, Stripe, GitHub,
  Google/Gemini, Slack, Discord, Telegram, Twilio, SendGrid, Shopify,
  DigitalOcean, Docker Hub, npm, Square, PayPal/Braintree, Mailchimp,
  Ethereum private keys, generic PEM private key blocks, database
  connection strings, URLs with embedded basic-auth credentials, bearer
  tokens, JWTs, and a catch-all `KEY=value` / `SECRET:` pattern for anything
  else that looks like a credential assignment.
- **Network** — internal/public IPs, MAC addresses, internal-looking URLs
  (localhost, staging/admin/dev subdomains).
- **PII** — credit cards, SSNs, email addresses, phone numbers, IBANs, VINs,
  passport numbers and dates of birth (keyword-anchored to keep false
  positives low).

**Semantic scan** (on by default via Deep Scan, fully on-device) adds: person
names, organizations, and location mentions. Enabling the nested **cloud**
scan on top adds broader coverage — physical addresses, named family
members, account identifiers, and plaintext security answers — none of
which have a fixed shape a regex can reliably match.

No detector catches *everything* sensitive with certainty — that's an
open-ended problem. The regex layer trades recall for precision on
freeform text (deliberately under-matches ambiguous PII rather than
flooding results with false positives); the on-device model trades some
accuracy for a hard privacy guarantee; the optional cloud layer trades that
guarantee for broader coverage. Pick your configuration accordingly.

## Feature checklist

1. **Pre-share checkpoint positioning** — "Is this safe to share?" is the landing page's dominant text, not "upload a screenshot."
2. **Safe-to-Share Score** — a percentage (not a raw risk number), four tiers: Safe to Post / Mostly Safe / Think Again / Do Not Share.
3. **Share Destination Risk** — GitHub / LinkedIn / Reddit / Discord / Stack Overflow / Email / Public Website / Other, each with its own risk tier, factored into the simulation prompt.
4. **Attacker Simulation** — first-person "If I were an attacker, I would..." framing, attack success probability, estimated damage.
5. **Leak Chain Visualizer** — animated graph of named nodes, each with a description and its own risk level.
6. **Time to Exploit** — per-asset timeline (Immediate / Under 5 Min / 30 Minutes / Several Hours / Unknown) plus a separate generic "what happens after you post this" timeline.
7. **Safe Screenshot Generator** — pixelates only the flagged regions, Download + Share Safely buttons.
8. **Privacy-First Architecture** — visual confirmation badge (local processing, no screenshot uploaded, secrets never leave device by default).
9. **Attack Confidence** — the model rates its own confidence per finding and explains why, rather than asserting false certainty.
10. **Business Impact Engine** — financial loss / downtime / customer impact / compliance risk / reputation damage, each independently rated.
11. **Attacker vs. Defender views** — animated tab switch between offensive narrative and defensive checklist.
12. **Scanning experience** — a real (not simulated) multi-step sequence: Scanning Screenshot → Extracting Metadata → Thinking Like an Attacker → Building Attack Chain → Calculating Business Impact → Generating Safe Version → Analysis Complete.
13. **Dual AI provider with failover** — Gemini and OpenRouter can both be configured; if one fails for any reason (network block, quota, outage), the other is tried automatically.
14. **On-device semantic scan** — a local NER model, running entirely in-browser via transformers.js/WASM, catches names/orgs/locations the regex layer can't — with no server dependency and no OCR text ever leaving the device. An optional, clearly separate cloud pass layers on top for broader coverage (addresses, family, security answers), off by default (see below).
15. **One-click remediation** — every credential finding links straight to the issuing provider's revoke/rotate page, plus a ready-to-copy `git filter-repo` command for secrets that ended up committed to a repo.
16. **CI integration** — `scripts/scan-images.ts` + `.github/workflows/scan-pr-images.yml` run the exact same detection pipeline headlessly to fail a PR that attaches a screenshot with a leaked key, not just this UI.
17. **Browser extension concept preview** — a UI-only mockup on the landing page showing how a future Chrome extension would intercept uploads. Not implemented, by design.

## Tech stack

Next.js 15 (App Router) · TypeScript · Tailwind CSS v4 · Framer Motion ·
react-dropzone · Tesseract.js · transformers.js (on-device NER) · Google
Gemini API · OpenRouter · Lucide icons. No database, no authentication, no
analytics, no dashboard.

## Getting started

```bash
npm install
cp .env.example .env.local   # then add your API key(s) — see below
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and drop in a screenshot.

Everything works with **no API keys at all** except the attack simulation
itself — OCR, all regex-based secret detection, the on-device semantic scan
(Deep Scan), the risk score, remediation links, and the safe-screenshot
download work fully offline. Without a key, the UI shows an inline
"attacker simulation unavailable" notice instead of failing silently.

### Attack simulation providers

Set either or both. With both set, HackSight tries one and automatically
falls back to the other if it fails for any reason.

```
# Google AI Studio: https://aistudio.google.com/apikey
GEMINI_API_KEY=your-key-here
GEMINI_MODEL=gemini-3.5-flash          # optional, this is the default

# OpenRouter: https://openrouter.ai/keys
OPENROUTER_API_KEY=your-key-here
OPENROUTER_MODEL=openai/gpt-4.1-mini   # optional, this is the default

SIMULATION_PROVIDER_ORDER=gemini,openrouter   # optional, try order
```

### Semantic scan

**On-device (default when Deep Scan is on):** no configuration needed. Runs
`Xenova/bert-base-NER` locally via transformers.js — the first scan in a
session downloads the ~40MB model from the Hugging Face CDN and caches it in
the browser; every scan after that, and every inference call, happens
without a network request. OCR text never leaves the device for this pass.

**Cloud (optional, nested under Deep Scan, off by default):** reuses
`OPENROUTER_API_KEY` above — set that key and the toggle becomes available
in the UI as a separate, explicit switch on top of the on-device pass.

```
SEMANTIC_SCAN_MODEL=openai/gpt-4.1-mini   # optional, this is the default
```

**Trade-off to understand before enabling the cloud pass:** unlike the
metadata-only simulation call, this sends the actual OCR'd text of your
screenshot to an external model so it can flag more than the on-device model
does (addresses, family references, plaintext security answers). If that's
not a trade-off you want, leave it off — the on-device pass still runs, and
`OPENROUTER_API_KEY` unset degrades the cloud toggle to disabled with no
error shown to the user.

## Project structure

```
src/
  app/
    page.tsx                     landing + orchestrates the analysis flow
    api/simulate/route.ts        calls Gemini/OpenRouter with metadata only
    api/semantic-scan/route.ts   optional pass — calls OpenRouter with OCR text
    error.tsx, not-found.tsx     branded error/404 states
  components/                    UI, one concern per file
  lib/
    patterns.ts                  regex pattern library (~40 asset types)
    detectSecrets.ts             maps regex + semantic matches to OCR bounding boxes, scores risk
    semanticScan.ts              optional cloud pass: LLM call over OCR text for broader unstructured PII coverage
    localSemanticScan.ts         on-device pass: local NER model via transformers.js, runs entirely in-browser
    remediation.ts               per-finding rotate/revoke links + git filter-repo command templates
    metadata.ts                  builds the privacy-safe payload sent for simulation
    ocr.ts                       Tesseract.js wrapper (singleton worker, reused across scans)
    gemini.ts                    server-only Gemini/OpenRouter client + structured prompt/schema
    redact.ts                    canvas-based pixelation for the safe screenshot
    timeToExploit.ts             parses free-text estimates into timeline buckets
scripts/
  capture-screenshots.mjs        optional Playwright script for real demo screenshots
  scan-images.ts                 CLI: runs the same detection pipeline headlessly via Node + tesseract.js
.github/workflows/
  scan-pr-images.yml             CI check: fails a PR that attaches a screenshot with a leaked secret
```

## Known limitations

- **No detector catches everything.** The regex layer only matches known
  shapes; unlabeled freeform PII (an address with no "Address:" label, a
  name with no other context) needs the semantic scan, which itself isn't
  exhaustive.
- **The on-device NER model trades accuracy for privacy.** It's a small,
  general-purpose model (~40MB) — expect more misses on ambiguous names and
  occasional false positives on common words the tokenizer treats as
  entities. The optional cloud pass is more thorough but sends OCR text
  externally; that's the trade being offered, not a bug in the local one.
- **Keyword-anchored PII patterns** (passport number, date of birth,
  generic `KEY=value` assignments) intentionally require a nearby label to
  avoid a flood of false positives — an unlabeled date or ID number won't
  be flagged by the regex layer alone.
- **OCR accuracy** depends on image quality — heavily compressed, very
  small, or non-English text may be missed, same as any OCR engine.
- **The attacker simulation is a simulation**, not a guarantee. It's
  grounded in short per-type technical notes (`ASSET_KNOWLEDGE` in
  `lib/gemini.ts`) specifically so it doesn't invent impossible attacks, but
  treat it as a fast desk review, not a penetration test.
- **No persistence, by design.** Nothing is stored server-side. Refreshing
  the page clears everything.

## Demo screenshots

Not included in this repo — generating real screenshots needs an actual
browser, which isn't available in the environment this was built in.
`scripts/capture-screenshots.mjs` automates it for you:

```bash
npm install --save-dev playwright
npx playwright install chromium
npm run screenshots                     # landing page, desktop + mobile
npm run screenshots -- ./sample.png     # + the analysis screen, using that image
```

Output lands in `docs/screenshots/`.

## Deployment

### Vercel (recommended)

Zero-config for Next.js. Push to a repo, import it in Vercel, and set
whichever of `GEMINI_API_KEY` / `OPENROUTER_API_KEY` (plus optional model
overrides) you want as environment variables in the project settings —
they're server-only and never bundled into client JS.

### Docker

```bash
docker build -t hacksight .
docker run -p 3000:3000 -e GEMINI_API_KEY=your-key-here hacksight
```

The `Dockerfile` uses Next's `output: "standalone"` build (configured in
`next.config.ts`) for a minimal runtime image — no dev dependencies, no
full `node_modules` copied in.

## Performance notes

- The Tesseract.js worker is created once and reused across every scan in a
  session (see `lib/ocr.ts`) — only the first screenshot pays the ~1–2s
  worker cold-start cost.
- The entire analysis UI (`AnalysisScreen` and everything it pulls in —
  Tesseract, Framer Motion, the attacker-simulation views) is dynamically
  imported and excluded from the landing page's bundle. The landing page
  itself uses plain CSS keyframe animations instead of Framer Motion for
  exactly this reason — pulling the library into the always-loaded shell
  would have undone the point of the dynamic import.
- `output: "standalone"` keeps the deployed server bundle to only the
  dependencies actually used at runtime.

## License

No license file is currently included — add one (MIT, Apache-2.0, etc.)
before treating this as open source others can freely reuse.
