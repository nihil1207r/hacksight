import { createRoot } from "react-dom/client";
import { useEffect, useState } from "react";
import { DEFAULT_SETTINGS, type Settings } from "../shared/types";
import { normalizeDomain, originPattern, SUPPORTED_SITES } from "../shared/sites";
import "../ui/styles.css";

function send<T>(message: unknown): Promise<T> {
  return chrome.runtime.sendMessage(message) as Promise<T>;
}

function Toggle({ checked, onChange, label, detail }: { checked: boolean; onChange: (next: boolean) => void; label: string; detail: string }) {
  return <div className="row"><span><strong>{label}</strong><small className="subtle">{detail}</small></span><label className="switch"><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /><span className="slider" /></label></div>;
}

function Options() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [domain, setDomain] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { void send<Settings>({ type: "settings:get" }).then(setSettings); }, []);
  const update = async (update: Partial<Settings>) => setSettings(await send<Settings>({ type: "settings:update", update }));
  const toggleSite = (key: string, enabled: boolean) => void update({ siteEnabled: { ...settings.siteEnabled, [key]: enabled } });

  const addDomain = async () => {
    const normalized = normalizeDomain(domain);
    if (!normalized) return setStatus("Enter a valid domain, for example docs.example.com.");
    if (settings.customDomains.includes(normalized)) return setStatus("That custom site is already enabled.");
    setBusy(true);
    try {
      const granted = await chrome.permissions.request({ origins: [originPattern(normalized)] });
      if (!granted) return setStatus("Chrome permission was not granted; HackSight was not added to that site.");
      await update({ customDomains: [...settings.customDomains, normalized], siteEnabled: { ...settings.siteEnabled, [normalized]: true } });
      setDomain("");
      setStatus(`${normalized} was added. Reload an existing tab on that site.`);
    } finally { setBusy(false); }
  };

  const toggleAllSites = async (enabled: boolean) => {
    if (!enabled) {
      await chrome.permissions.remove({ origins: ["https://*/*", "http://*/*"] });
      return update({ protectAllSites: false });
    }
    setBusy(true);
    try {
      const granted = await chrome.permissions.request({ origins: ["https://*/*", "http://*/*"] });
      if (!granted) return setStatus("Chrome permission was not granted; HackSight was not enabled everywhere.");
      await update({ protectAllSites: true });
      setStatus("HackSight now reviews uploads on every website. Reload open tabs to apply it.");
    } finally {
      setBusy(false);
    }
  };

  const removeDomain = async (value: string) => {
    await chrome.permissions.remove({ origins: [originPattern(value)] });
    const nextEnabled = { ...settings.siteEnabled };
    delete nextEnabled[value];
    await update({ customDomains: settings.customDomains.filter((domain) => domain !== value), siteEnabled: nextEnabled });
  };

  const toggleCloud = async (enabled: boolean) => {
    if (!enabled) {
      await chrome.permissions.remove({ origins: ["https://openrouter.ai/*"] });
      return update({ cloudSemanticScan: false });
    }
    const granted = await chrome.permissions.request({ origins: ["https://openrouter.ai/*"] });
    if (!granted) return setStatus("Cloud Scan stays off because OpenRouter permission was not granted.");
    await update({ cloudSemanticScan: true });
  };

  return <main className="shell options"><div className="topline"><div><h1>HackSight AI settings</h1><p className="subtle">Protection is local by default. Nothing leaves your device unless you explicitly turn on Cloud Semantic Scan.</p></div><span className="tag">Local-first</span></div><section className="card"><Toggle label="Enable HackSight AI" detail="Review supported image uploads before a site receives them." checked={settings.enabled} onChange={(enabled) => void update({ enabled })} /></section><h2 className="section-title">Supported sites</h2><section className="card site-list">{SUPPORTED_SITES.map((site) => <div className="site row" key={site.id}><span><div className="site-name">{site.label}</div><p className="hint">{site.domains.join(", ")}</p></span><label className="switch"><input type="checkbox" checked={settings.siteEnabled[site.id] !== false} onChange={(event) => toggleSite(site.id, event.target.checked)} /><span className="slider" /></label></div>)}</section><h2 className="section-title">Every website</h2><section className="card"><Toggle label="Protect me everywhere" detail="Review image uploads on any http(s) site, not just the ones below. Chrome will ask you to confirm this broader permission." checked={settings.protectAllSites} onChange={(enabled) => void toggleAllSites(enabled)} />{settings.protectAllSites && <div className="notice">HackSight is active on every site you visit. Turn this off — or disable protection for a specific site below — any time.</div>}</section><h2 className="section-title">Custom site allowlist</h2><section className="card"><p className="subtle">{settings.protectAllSites ? "\"Protect me everywhere\" is on, so this list is optional — use it only if you want per-site control instead." : "Add individual domains one at a time, or turn on \"Protect me everywhere\" above for blanket coverage."}</p><div className="form-row"><input className="field" value={domain} onChange={(event) => setDomain(event.target.value)} placeholder="community.example.com" aria-label="Custom site domain" /><button className="button primary" disabled={busy} onClick={() => void addDomain()}>Add site</button></div>{settings.customDomains.map((value) => <div className="row site" key={value}><span><strong>{value}</strong><small className="subtle">Custom upload protection</small></span><div className="row"><label className="switch"><input type="checkbox" checked={settings.siteEnabled[value] !== false} onChange={(event) => toggleSite(value, event.target.checked)} /><span className="slider" /></label><button className="danger" onClick={() => void removeDomain(value)}>Remove</button></div></div>)}{status && <p className="success">{status}</p>}</section><h2 className="section-title">Deep Scan</h2><section className="card"><Toggle label="On-device NER" detail="Uses the bundled NER model to find names, organizations, and locations alongside local OCR and regex checks. OCR text never leaves your device." checked={settings.deepScan} onChange={(deepScan) => void update({ deepScan, cloudSemanticScan: deepScan ? settings.cloudSemanticScan : false })} /><div className="notice">The model is bundled with the extension; it is not fetched at scan time. Deep Scan can miss ambiguous information and may flag false positives.</div><div className="row" style={{ marginTop: 14 }}><span><strong>Cloud Semantic Scan</strong><small className="subtle">Optional second pass through OpenRouter using your own API key.</small></span><label className="switch"><input type="checkbox" checked={settings.deepScan && settings.cloudSemanticScan} disabled={!settings.deepScan} onChange={(event) => void toggleCloud(event.target.checked)} /><span className="slider" /></label></div>{settings.cloudSemanticScan && <><div className="notice">Trade-off: this sends OCR text — not image pixels — to OpenRouter so it can identify broader unstructured details such as addresses, family references, account IDs, and plaintext security answers. Leave this off for the full local-only privacy guarantee.</div><label className="hint" htmlFor="openrouter-key">OpenRouter API key (stored only in chrome.storage.local)</label><input id="openrouter-key" className="field" type="password" value={settings.openRouterApiKey} onChange={(event) => setSettings({ ...settings, openRouterApiKey: event.target.value })} onBlur={() => void update({ openRouterApiKey: settings.openRouterApiKey })} autoComplete="off" placeholder="sk-or-v1-…" /></>}</section></main>;
}

createRoot(document.getElementById("root")!).render(<Options />);
