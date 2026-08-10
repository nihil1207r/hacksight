export type DestinationId =
  | "github"
  | "linkedin"
  | "reddit"
  | "discord"
  | "stackoverflow"
  | "email"
  | "public_website"
  | "other";

export type DestinationRisk = "low" | "medium" | "high" | "critical";

export interface Destination {
  id: DestinationId;
  label: string;
  risk: DestinationRisk;
  tagline: string;
  detail: string;
}

export const DESTINATIONS: Destination[] = [
  {
    id: "github",
    label: "GitHub",
    risk: "critical",
    tagline: "Public forever",
    detail: "Indexed within minutes, cached permanently even if you delete it, and continuously scanned by credential-harvesting bots.",
  },
  {
    id: "public_website",
    label: "Public Website",
    risk: "critical",
    tagline: "Open to anyone, indexed by search engines",
    detail: "No audience control at all — anyone, including automated scanners, can find it the moment it's live.",
  },
  {
    id: "linkedin",
    label: "LinkedIn",
    risk: "high",
    tagline: "Public profile, professional audience",
    detail: "Publicly visible and screenshot-friendly; tied to your real identity, which raises the stakes of social engineering follow-up.",
  },
  {
    id: "reddit",
    label: "Reddit",
    risk: "high",
    tagline: "Public, often anonymous, widely mirrored",
    detail: "Public posts get scraped and mirrored quickly, and subreddit archives make old posts easy to resurface.",
  },
  {
    id: "stackoverflow",
    label: "Stack Overflow",
    risk: "high",
    tagline: "Public, permanent, developer-focused audience",
    detail: "Answers are indexed forever and specifically read by other developers — exactly the audience that recognizes exploitable credentials.",
  },
  {
    id: "discord",
    label: "Discord",
    risk: "medium",
    tagline: "Semi-private server",
    detail: "Limited to server members, but messages can be screenshotted, forwarded, or scraped by bots with channel access.",
  },
  {
    id: "email",
    label: "Email",
    risk: "low",
    tagline: "Recipient-specific",
    detail: "Goes to a known recipient rather than the open internet, but forwarding and compromised inboxes are still a real risk.",
  },
  {
    id: "other",
    label: "Other / Not sure",
    risk: "medium",
    tagline: "Unknown audience",
    detail: "Treated as a general public share since the actual audience and permanence aren't known.",
  },
];

export function getDestination(id: DestinationId | null | undefined): Destination | null {
  return DESTINATIONS.find((d) => d.id === id) ?? null;
}
