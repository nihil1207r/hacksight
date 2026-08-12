import type { Finding } from "@hacksight/lib/detectSecrets";
import { DEFAULT_SETTINGS, type ScanSummary, type ScanTier, type Settings } from "../shared/types";
import { originPattern, siteForHostname, SUPPORTED_MATCHES } from "../shared/sites";

const SETTINGS_KEY = "settings";
const LAST_SCAN_KEY = "lastScan";
const CUSTOM_CONTENT_SCRIPT_ID = "hacksight-custom-sites";
const ALL_SITES_CONTENT_SCRIPT_ID = "hacksight-all-sites";
const ALL_SITES_MATCHES = ["https://*/*", "http://*/*"];

export interface StoredScanSummary extends Omit<ScanSummary, "findings"> {
  findings: Array<Pick<Finding, "id" | "label" | "category" | "severity" | "maskedValue">>;
}

async function getSettings(): Promise<Settings> {
  const stored = await chrome.storage.local.get(SETTINGS_KEY);
  return {
    ...DEFAULT_SETTINGS,
    ...(stored[SETTINGS_KEY] as Partial<Settings> | undefined),
    siteEnabled: { ...DEFAULT_SETTINGS.siteEnabled, ...(stored[SETTINGS_KEY] as Partial<Settings> | undefined)?.siteEnabled },
  };
}

async function saveSettings(update: Partial<Settings>): Promise<Settings> {
  const next = { ...(await getSettings()), ...update };
  next.siteEnabled = { ...DEFAULT_SETTINGS.siteEnabled, ...next.siteEnabled };
  await chrome.storage.local.set({ [SETTINGS_KEY]: next });
  await registerCustomContentScripts(next.customDomains);
  await registerAllSitesContentScript(next.protectAllSites);
  return next;
}

function activeContentFile(): string {
  const contentFile = chrome.runtime.getManifest().content_scripts?.[0]?.js?.[0];
  if (!contentFile) throw new Error("HackSight content script was not found in the manifest.");
  return contentFile;
}

/**
 * chrome.scripting.registerContentScripts only affects *future* navigations
 * — a tab that's already sitting open on a matching site never picks up a
 * newly-registered script on its own, which is exactly what "only works
 * after I reload the page" looks like from the outside. Inject directly
 * into whatever matching tabs are already open the moment protection is
 * turned on for them, so it's active immediately, no reload required.
 *
 * `skip` lets a caller exclude tabs already covered by a different
 * registration (see registerAllSitesContentScript) — Chrome does not
 * deduplicate overlapping content-script registrations on its own, and
 * injecting the same module twice into one page creates two independent
 * copies of all its state and event listeners, which shows up over a
 * session as stuck scans, duplicated popups, or a UI that stops responding
 * until the page is reloaded.
 */
async function injectIntoOpenTabs(matches: string[], skip?: (hostname: string) => boolean): Promise<void> {
  if (matches.length === 0) return;
  let tabs: chrome.tabs.Tab[];
  try {
    tabs = await chrome.tabs.query({ url: matches });
  } catch {
    return; // best-effort — the next real navigation will still pick up the registration
  }
  const file = activeContentFile();
  await Promise.all(
    tabs
      .filter((tab): tab is chrome.tabs.Tab & { id: number; url: string } => typeof tab.id === "number" && typeof tab.url === "string")
      .filter((tab) => {
        if (!skip) return true;
        try {
          return !skip(new URL(tab.url).hostname.toLowerCase());
        } catch {
          return true;
        }
      })
      .map((tab) =>
        chrome.scripting
          .executeScript({ target: { tabId: tab.id }, files: [file] })
          .catch(() => undefined) // e.g. chrome:// tabs, or the tab navigated away mid-query — safe to skip
      )
  );
}

async function registerCustomContentScripts(domains: string[]): Promise<void> {
  await chrome.scripting.unregisterContentScripts({ ids: [CUSTOM_CONTENT_SCRIPT_ID] }).catch(() => undefined);
  if (domains.length === 0) return;

  await chrome.scripting.registerContentScripts([
    {
      id: CUSTOM_CONTENT_SCRIPT_ID,
      matches: domains.map(originPattern),
      js: [activeContentFile()],
      runAt: "document_start",
      persistAcrossSessions: true,
    },
  ]);
  await injectIntoOpenTabs(domains.map(originPattern));
}

/** Registers (or removes) a single content script matching every http(s)
 * site. Only ever called after the user has explicitly opted in and granted
 * the broad optional host permission from the options page — nothing here
 * requests or assumes that permission on its own. */
async function registerAllSitesContentScript(enabled: boolean): Promise<void> {
  await chrome.scripting.unregisterContentScripts({ ids: [ALL_SITES_CONTENT_SCRIPT_ID] }).catch(() => undefined);
  if (!enabled) return;

  const hasPermission = await chrome.permissions.contains({ origins: ALL_SITES_MATCHES });
  if (!hasPermission) return; // permission was revoked outside the options page — stay off rather than throw

  // Sites already covered by the static manifest entry (the 5 built-in
  // sites) or an individually-added custom domain must be excluded here —
  // otherwise a page matching both this and one of those gets the content
  // script injected twice, with two independent copies of all its state.
  const { customDomains } = await getSettings();
  const isAlreadyCovered = (hostname: string): boolean =>
    siteForHostname(hostname) !== null || customDomains.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
  const excludeMatches = [...SUPPORTED_MATCHES, ...customDomains.map(originPattern)];

  await chrome.scripting.registerContentScripts([
    {
      id: ALL_SITES_CONTENT_SCRIPT_ID,
      matches: ALL_SITES_MATCHES,
      excludeMatches,
      js: [activeContentFile()],
      runAt: "document_start",
      persistAcrossSessions: true,
    },
  ]);
  await injectIntoOpenTabs(ALL_SITES_MATCHES, isAlreadyCovered);
}

function storedSummary(summary: ScanSummary): StoredScanSummary {
  return {
    ...summary,
    findings: summary.findings.map(({ id, label, category, severity, maskedValue }) => ({ id, label, category, severity, maskedValue })),
  };
}

const TIER_COLOR: Record<ScanTier, string> = {
  safe: "#33d992",
  mostly_safe: "#ffb020",
  think_again: "#ff7a1a",
  do_not_share: "#ff3b4e",
};

const TIER_BADGE: Record<ScanTier, string> = {
  safe: "✓",
  mostly_safe: "!",
  think_again: "!!",
  do_not_share: "X",
};

function iconFor(tier: ScanTier): ImageData {
  const canvas = new OffscreenCanvas(32, 32);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is unavailable.");
  ctx.clearRect(0, 0, 32, 32);
  ctx.fillStyle = "#09090d";
  ctx.beginPath();
  ctx.roundRect(3, 3, 26, 26, 8);
  ctx.fill();
  ctx.strokeStyle = TIER_COLOR[tier];
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(16, 6);
  ctx.lineTo(25, 10);
  ctx.lineTo(23, 21);
  ctx.lineTo(16, 26);
  ctx.lineTo(9, 21);
  ctx.lineTo(7, 10);
  ctx.closePath();
  ctx.stroke();
  return ctx.getImageData(0, 0, 32, 32);
}

async function setBadge(summary: StoredScanSummary): Promise<void> {
  await chrome.action.setBadgeText({ text: TIER_BADGE[summary.tier] });
  await chrome.action.setBadgeBackgroundColor({ color: TIER_COLOR[summary.tier] });
  await chrome.action.setTitle({ title: `HackSight AI: ${tierLabel(summary.tier)} (${summary.score}% Safe-to-Share)` });
  await chrome.action.setIcon({ imageData: iconFor(summary.tier) });
}

function tierLabel(tier: ScanTier): string {
  return { safe: "Safe to Post", mostly_safe: "Mostly Safe", think_again: "Think Again", do_not_share: "Do Not Share" }[tier];
}

chrome.runtime.onInstalled.addListener(async () => {
  const settings = await getSettings();
  await chrome.storage.local.set({ [SETTINGS_KEY]: settings });
  await registerCustomContentScripts(settings.customDomains);
  await registerAllSitesContentScript(settings.protectAllSites);
});

chrome.runtime.onStartup.addListener(async () => {
  const settings = await getSettings();
  await registerCustomContentScripts(settings.customDomains);
  await registerAllSitesContentScript(settings.protectAllSites);
});

// If the user (or Chrome) revokes the broad host permission from outside the
// options page — e.g. via chrome://extensions — stop matching every site
// instead of leaving a stale registration Chrome will refuse to honor anyway.
chrome.permissions.onRemoved.addListener((removed) => {
  const lostAllSites = ALL_SITES_MATCHES.every((pattern) => removed.origins?.includes(pattern));
  if (!lostAllSites) return;
  void saveSettings({ protectAllSites: false });
});

chrome.runtime.onMessage.addListener((message: { type: string; update?: Partial<Settings>; summary?: ScanSummary }, _sender, sendResponse) => {
  void (async () => {
    try {
      if (message.type === "settings:get") return sendResponse(await getSettings());
      if (message.type === "settings:update") return sendResponse(await saveSettings(message.update ?? {}));
      if (message.type === "last-scan:get") {
        const result = await chrome.storage.local.get(LAST_SCAN_KEY);
        return sendResponse(result[LAST_SCAN_KEY] as StoredScanSummary | undefined);
      }
      if (message.type === "scan:complete" && message.summary) {
        const summary = storedSummary(message.summary);
        await chrome.storage.local.set({ [LAST_SCAN_KEY]: summary });
        await setBadge(summary);
        return sendResponse({ ok: true });
      }
      sendResponse({ error: "Unknown HackSight message." });
    } catch (error) {
      sendResponse({ error: error instanceof Error ? error.message : "HackSight could not complete this request." });
    }
  })();
  return true;
});