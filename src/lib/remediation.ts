import { AssetType, AssetCategory } from "./patterns";

export interface Remediation {
  /** Short call-to-action, e.g. "Rotate this key" / "Review before sharing". */
  label: string;
  /** Link to the provider's dashboard where the credential can be revoked/rotated. Omitted when no single URL applies. */
  url?: string;
  /** One-line "what to actually do" guidance shown under the label. */
  note: string;
  /** git-filter-repo command to strip this value from git history, shown for credentials that commonly end up committed to a repo. */
  gitCommand?: string;
}

// Only entries where a leaked credential is rotated/revoked at a single,
// predictable dashboard URL. Anything not listed here falls back to a
// text-only note (below) — a wrong or dead link is worse than no link.
const ROTATE_URL: Partial<Record<AssetType, string>> = {
  aws_access_key: "https://console.aws.amazon.com/iam/home#/security_credentials",
  openai_key: "https://platform.openai.com/api-keys",
  github_token: "https://github.com/settings/tokens",
  google_api_key: "https://console.cloud.google.com/apis/credentials",
  stripe_key: "https://dashboard.stripe.com/apikeys",
  slack_token: "https://api.slack.com/apps",
  slack_webhook: "https://api.slack.com/apps",
  discord_token: "https://discord.com/developers/applications",
  twilio_key: "https://console.twilio.com/us1/account/keys-credentials/api-keys",
  sendgrid_key: "https://app.sendgrid.com/settings/api_keys",
  npm_token: "https://www.npmjs.com/settings/~/tokens",
  digitalocean_token: "https://cloud.digitalocean.com/account/api/tokens",
  dockerhub_token: "https://hub.docker.com/settings/security",
  azure_storage_key: "https://portal.azure.com/#view/HubsExtension/BrowseResource",
  gcp_service_account_key: "https://console.cloud.google.com/iam-admin/serviceaccounts",
  square_token: "https://developer.squareup.com/apps",
  paypal_braintree_token: "https://developer.paypal.com/dashboard/",
  mailchimp_api_key: "https://admin.mailchimp.com/account/api/",
};

const CREDENTIAL_NOTE: Partial<Record<AssetType, string>> = {
  telegram_bot_token: "Message @BotFather with /revoke to invalidate this token and issue a new one.",
  discord_webhook: "Regenerate it from the channel's Settings → Integrations → Webhooks panel.",
  shopify_token: "Revoke it from the store admin under Settings → Apps and sales channels → Develop apps.",
  private_key_block: "Generate a new keypair and remove the old public key from every server/service that trusted it.",
  basic_auth_url: "Rotate the password at the service this URL points to — the credential is compromised, not just the link.",
  bearer_token: "Revoke this token in whichever API/dashboard issued it, then reissue a new one.",
  generic_secret_assignment: "Rotate the underlying credential at its source — treat it as compromised even though the exact service isn't identifiable from OCR.",
  jwt: "A JWT itself can't be individually revoked — rotate the signing key or invalidate the session it was issued for.",
  database_url: "Rotate the database user's password and, if possible, restrict network access to trusted IPs.",
  ethereum_private_key: "Move any funds to a new wallet immediately — a private key can't be rotated, only abandoned.",
};

const CREDENTIAL_FALLBACK_NOTE = "Treat this credential as compromised and rotate/revoke it at the issuing service.";

const REVIEW_NOTE: Partial<Record<AssetType, string>> = {
  credit_card: "If this is a real card, contact the issuer to reissue it — treat the number as compromised.",
  ssn: "Consider a credit freeze if this was ever shared publicly.",
  passport_number: "Blur before sharing; a visible passport number can be used for identity verification fraud.",
};

const CATEGORY_FALLBACK_NOTE: Record<AssetCategory, string> = {
  credential: CREDENTIAL_FALLBACK_NOTE,
  network: "Only share this if the recipient needs it — it exposes internal infrastructure details.",
  identifier: "Blur or crop this before sharing outside your organization.",
  pii: "Blur or crop this before sharing — it identifies a real person.",
};

/** git-filter-repo removes a value from every commit in a repo's history, not
 * just the latest one — necessary because deleting the file in a new commit
 * leaves the secret readable in history forever. Shown as a template rather
 * than with the actual leaked value filled in, since this tool never surfaces
 * unmasked secrets in the UI. */
function gitCommandFor(label: string): string {
  return [
    "# Replace <LEAKED_VALUE> with the actual secret from your file, then run from the repo root:",
    `git filter-repo --replace-text <(echo '<LEAKED_VALUE>==>REDACTED_${label.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}')`,
    "# Rewriting history requires everyone to re-clone — force-push and notify collaborators:",
    "git push --force --all && git push --force --tags",
  ].join("\n");
}

export function getRemediation(type: AssetType, category: AssetCategory): Remediation {
  if (category === "credential") {
    const url = ROTATE_URL[type];
    return {
      label: "Rotate this key",
      url,
      note: CREDENTIAL_NOTE[type] ?? (url ? "Revoke the old key immediately after issuing a new one." : CREDENTIAL_FALLBACK_NOTE),
      gitCommand: gitCommandFor(type),
    };
  }

  return {
    label: "Review before sharing",
    note: REVIEW_NOTE[type] ?? CATEGORY_FALLBACK_NOTE[category],
  };
}
