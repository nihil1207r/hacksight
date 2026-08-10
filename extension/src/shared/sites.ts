export type SiteId = "github" | "reddit" | "discord" | "stackoverflow" | "linkedin" | "custom";

export interface SupportedSite {
  id: Exclude<SiteId, "custom">;
  label: string;
  domains: readonly string[];
  matchPatterns: readonly string[];
}

export const SUPPORTED_SITES: readonly SupportedSite[] = [
  { id: "github", label: "GitHub", domains: ["github.com"], matchPatterns: ["https://github.com/*"] },
  { id: "reddit", label: "Reddit", domains: ["reddit.com", "www.reddit.com"], matchPatterns: ["https://*.reddit.com/*"] },
  {
    id: "discord",
    label: "Discord", 
    domains: ["discord.com", "ptb.discord.com", "canary.discord.com"],
    matchPatterns: ["https://discord.com/*", "https://ptb.discord.com/*", "https://canary.discord.com/*"],
  },
  { id: "stackoverflow", label: "Stack Overflow", domains: ["stackoverflow.com"], matchPatterns: ["https://stackoverflow.com/*"] },
  { id: "linkedin", label: "LinkedIn", domains: ["www.linkedin.com"], matchPatterns: ["https://www.linkedin.com/*"] },
];

export const SUPPORTED_MATCHES = SUPPORTED_SITES.flatMap((site) => site.matchPatterns);

export function siteForHostname(hostname: string): SiteId | null {
  const lower = hostname.toLowerCase();
  const site = SUPPORTED_SITES.find((item) => item.domains.some((domain) => lower === domain || lower.endsWith(`.${domain}`)));
  return site?.id ?? null;
}

export function normalizeDomain(value: string): string | null {
  const raw = value.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  if (!/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i.test(raw)) return null;
  return raw;
}

export function originPattern(domain: string): string {
  return `https://${domain}/*`;
}
