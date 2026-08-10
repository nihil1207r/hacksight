import { createRoot } from "react-dom/client";
import { useEffect, useState } from "react";
import type { StoredScanSummary } from "../background";
import { DEFAULT_SETTINGS, type Settings } from "../shared/types";
import { siteForHostname } from "../shared/sites";
import "../ui/styles.css";
import "./popup.css";

function send<T>(message: unknown): Promise<T> {
  return chrome.runtime.sendMessage(message) as Promise<T>;
}

const tierLabel = { safe: "Safe to Post", mostly_safe: "Mostly Safe", think_again: "Think Again", do_not_share: "Do Not Share" };

function Toggle({ checked, onChange, label, detail }: { checked: boolean; onChange: (next: boolean) => void; label: string; detail: string }) {
  return <div className="row"><span><strong>{label}</strong><small className="subtle">{detail}</small></span><label className="switch"><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /><span className="slider" /></label></div>;
}

function Popup() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [siteKey, setSiteKey] = useState<string | null>(null);
  const [siteLabel, setSiteLabel] = useState("this site");
  const [lastScan, setLastScan] = useState<StoredScanSummary>();

  const update = async (update: Partial<Settings>) => setSettings(await send<Settings>({ type: "settings:update", update }));
  useEffect(() => {
    void send<Settings>({ type: "settings:get" }).then(setSettings);
    void send<StoredScanSummary | undefined>({ type: "last-scan:get" }).then(setLastScan);
    void chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
      if (!tab.url) return;
      const url = new URL(tab.url);
      const staticSite = siteForHostname(url.hostname);
      const custom = settings.customDomains.find((domain) => url.hostname === domain || url.hostname.endsWith(`.${domain}`));
      setSiteKey(staticSite ?? custom ?? null);
      setSiteLabel(staticSite ? staticSite[0].toUpperCase() + staticSite.slice(1) : custom ?? url.hostname);
    });
  }, [settings.customDomains]);

  return <main className="shell popup"><div className="topline"><div className="brand">HackSight AI</div><span className="tag">Local-first</span></div><p className="subtle">Review screenshots before they leave your browser.</p><section className="card"><Toggle label="Protection" detail="Pause image uploads for review" checked={settings.enabled} onChange={(enabled) => void update({ enabled })} />{siteKey && <Toggle label={`${siteLabel} protection`} detail="Enable HackSight on this site" checked={settings.siteEnabled[siteKey] !== false} onChange={(enabled) => void update({ siteEnabled: { ...settings.siteEnabled, [siteKey]: enabled } })} />}</section><section className="card">{lastScan ? <><div className="row"><div><div className={`tier ${lastScan.tier}`}>{tierLabel[lastScan.tier]}</div><div className="subtle">Last scan · {lastScan.site}</div></div><div className="score">{lastScan.score}%</div></div><ul className="findings">{lastScan.findings.slice(0, 3).map((finding) => <li key={finding.id}><span>{finding.label}</span><code>{finding.maskedValue}</code></li>)}</ul>{lastScan.findings.length > 3 && <p className="subtle">+ {lastScan.findings.length - 3} more finding(s)</p>}</> : <><strong>No scans yet</strong><p className="subtle">Your latest local scan summary will appear here.</p></>}</section><a className="button link" href="../options/index.html" target="_blank" rel="noreferrer">Open settings</a></main>;
}

createRoot(document.getElementById("root")!).render(<Popup />);
