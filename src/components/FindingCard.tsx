"use client";

import { useState } from "react";
import { KeyRound, Link2, Mail, Server, ShieldQuestion, Database, Fingerprint, CreditCard, IdCard, Webhook, Bot, MessageSquare, Phone, Car, Landmark, Cloud, Coins, User, MapPin, Building2, Users, Lock, ExternalLink, Copy, Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Finding } from "@/lib/detectSecrets";
import { getRemediation } from "@/lib/remediation";

const ICONS: Record<Finding["type"], React.ComponentType<{ size?: number; color?: string }>> = {
  aws_access_key: KeyRound,
  openai_key: KeyRound,
  github_token: KeyRound,
  google_api_key: KeyRound,
  stripe_key: KeyRound,
  slack_token: KeyRound,
  slack_webhook: Webhook,
  discord_token: Bot,
  discord_webhook: Webhook,
  telegram_bot_token: Bot,
  twilio_key: KeyRound,
  sendgrid_key: KeyRound,
  npm_token: KeyRound,
  shopify_token: KeyRound,
  digitalocean_token: KeyRound,
  dockerhub_token: KeyRound,
  azure_storage_key: Database,
  private_key_block: Fingerprint,
  basic_auth_url: Link2,
  bearer_token: MessageSquare,
  credit_card: CreditCard,
  ssn: IdCard,
  generic_secret_assignment: ShieldQuestion,
  jwt: Fingerprint,
  database_url: Database,
  internal_ip: Server,
  ip_address: Server,
  internal_url: Link2,
  url: Link2,
  email: Mail,
  phone_number: Phone,
  mac_address: Server,
  iban: Landmark,
  vin: Car,
  gcp_service_account_key: Cloud,
  ethereum_private_key: Coins,
  mailchimp_api_key: KeyRound,
  square_token: KeyRound,
  paypal_braintree_token: KeyRound,
  passport_number: IdCard,
  date_of_birth: IdCard,
  person_name: User,
  physical_address: MapPin,
  employer_or_workplace: Building2,
  family_relation: Users,
  account_identifier: IdCard,
  security_answer: Lock,
  other_sensitive: ShieldQuestion,
  social_handle: User,
  manual_redaction: ShieldQuestion,
};

function severityTone(severity: number): "red" | "amber" | "green" {
  if (severity >= 7) return "red";
  if (severity >= 4) return "amber";
  return "green";
}

export function FindingCard({ finding }: { finding: Finding }) {
  const Icon = ICONS[finding.type] ?? ShieldQuestion;
  const tone = severityTone(finding.severity);
  const remediation = getRemediation(finding.type, finding.category);
  const [copied, setCopied] = useState(false);

  async function copyGitCommand() {
    if (!remediation.gitCommand) return;
    await navigator.clipboard.writeText(remediation.gitCommand);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div
      className="rounded-xl p-3.5"
      style={{ border: "1px solid var(--hairline)", background: "rgba(255,255,255,0.015)" }}
    >
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon size={15} color={tone === "red" ? "var(--red)" : tone === "amber" ? "var(--amber)" : "var(--green)"} />
          <span className="font-display text-[13.5px] font-semibold">{finding.label}</span>
        </div>
        <Badge tone={tone}>severity {finding.severity}/10</Badge>
      </div>
      <div className="font-mono mb-2.5 text-[12.5px]" style={{ color: "var(--muted)" }}>
        {finding.maskedValue}
      </div>
      <div className="mb-2.5 flex flex-wrap gap-1.5">
        <Badge tone="neutral">{finding.environment}</Badge>
        <Badge tone="neutral">{finding.visibility}</Badge>
      </div>

      <div className="pt-2.5" style={{ borderTop: "1px solid var(--hairline)" }}>
        <div className="flex items-center justify-between gap-2">
          {remediation.url ? (
            <a
              href={remediation.url}
              target="_blank"
              rel="noopener noreferrer"
              className="font-display inline-flex items-center gap-1.5 text-[12.5px] font-semibold"
              style={{ color: "var(--red)" }}
            >
              {remediation.label}
              <ExternalLink size={12} />
            </a>
          ) : (
            <span className="font-display text-[12.5px] font-semibold" style={{ color: "var(--text)" }}>
              {remediation.label}
            </span>
          )}
          {remediation.gitCommand && (
            <button
              type="button"
              onClick={copyGitCommand}
              className="font-mono inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] tracking-wide"
              style={{ color: "var(--muted)", borderColor: "var(--hairline)", background: "rgba(255,255,255,0.02)" }}
            >
              {copied ? <Check size={11} /> : <Copy size={11} />}
              {copied ? "copied" : "remove from git history"}
            </button>
          )}
        </div>
        <div className="mt-1 text-[12px] leading-relaxed" style={{ color: "var(--muted)" }}>
          {remediation.note}
        </div>
      </div>
    </div>
  );
}
