import { scoreFindings } from "@hacksight/lib/detectSecrets";
import { generateSafeImage, scanLocally } from "../shared/pipeline";
import { makeFailedScanSummary, type ScanSummary, type Settings } from "../shared/types";
import { siteForHostname, type SiteId } from "../shared/sites";

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
let reviewInProgress = false;
let replayingUpload = false;
let settingsCache: Settings | null = null;
let activeScanDialog: { update: (message: string) => void; close: () => void } | null = null;

interface UploadContext {
  input: HTMLInputElement | null;
  target: EventTarget | null;
  source: "input" | "drop" | "paste";
}

type ReviewDecision = { action: "continue"; file: File } | { action: "cancel" };

function send<T>(message: unknown): Promise<T> {
  return chrome.runtime.sendMessage(message) as Promise<T>;
}

const SUPPORTED_IMAGE_MIME = /^image\/(png|jpeg|webp)$/i;
const SUPPORTED_IMAGE_EXTENSION = /\.(png|jpe?g|webp)$/i;

function isSupportedImage(file: File): boolean {
  if (file.size === 0 || file.size > MAX_IMAGE_BYTES) return false;
  if (SUPPORTED_IMAGE_MIME.test(file.type)) return true;
  // Drag-and-drop and clipboard paste reliably tag file.type with a real
  // MIME type. The native OS "Choose File" dialog often does not — on
  // systems with no MIME mapping registered for the extension, or with
  // certain file managers, it comes back empty or as the generic
  // "unknown file" placeholder even for an ordinary image. Falling back to
  // the filename extension in exactly those cases means a picked file
  // still gets scanned instead of silently passing through unreviewed —
  // this never widens what a real MIME-tagged upload is allowed to be.
  const type = file.type.toLowerCase();
  if ((type === "" || type === "application/octet-stream") && SUPPORTED_IMAGE_EXTENSION.test(file.name)) return true;
  return false;
}

function findInput(target: EventTarget | null): HTMLInputElement | null {
  if (target instanceof HTMLInputElement && target.type === "file") return target;
  if (target instanceof Element) {
    const nearby = target.closest("form, [role=dialog], [contenteditable], body")?.querySelector<HTMLInputElement>('input[type="file"]');
    if (nearby) return nearby;
  }
  return document.querySelector<HTMLInputElement>('input[type="file"]');
}

/** event.target is retargeted to the shadow host once an event crosses a
 * shadow-root boundary, so on sites that render their upload input inside a
 * (open or closed) shadow root, `event.target` is never the real <input> and
 * we silently miss the upload. composedPath()[0] is always the true
 * originating node, shadow DOM or not. */
function realTarget(event: Event): EventTarget | null {
  const path = typeof event.composedPath === "function" ? event.composedPath() : [];
  return path[0] ?? event.target;
}

/**
 * Rich-text editors (ProseMirror, Lexical, Tiptap, and similar) put
 * `contenteditable` on one root container and render plain, non-editable
 * child nodes (a placeholder `<p>`, a text run, etc.) inside it — that's
 * usually exactly where the cursor sits, and exactly what a real event's
 * target ends up being. Those editors bind their paste/drop handling, and
 * their internal selection/focus logic, to that root — not to whichever
 * descendant happened to be under the cursor. Replaying onto the leaf node
 * often silently does nothing; walking up to the actual editable root
 * mirrors what a real paste/drop would have hit.
 */
function editableRoot(node: EventTarget | null): Element | null {
  let el = node instanceof Element ? node : null;
  while (el) {
    if (el.hasAttribute("contenteditable") || el.tagName === "TEXTAREA" || el.tagName === "INPUT") return el;
    el = el.parentElement;
  }
  return node instanceof Element ? node : null;
}

function currentSite(settings: Settings): { site: SiteId; settingKey: string } | null {
  const hostname = location.hostname.toLowerCase();
  const supported = siteForHostname(hostname);
  if (supported) return { site: supported, settingKey: supported };
  const custom = settings.customDomains.find((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
  if (custom) return { site: "custom", settingKey: custom };
  // "Protect me everywhere" mode: the user granted broad host access from
  // options, so any site not already covered above is still reviewed.
  if (settings.protectAllSites) return { site: "custom", settingKey: "*" };
  return null;
}

function showToast(message: string, tone: "info" | "warning" | "success" = "info"): void {
  const root = document.createElement("div");
  const shadow = root.attachShadow({ mode: "closed" });
  const colors = { info: "#263b66", warning: "#8a4c13", success: "#176444" };
  shadow.innerHTML = `<style>:host{all:initial}.toast{position:fixed;right:18px;bottom:18px;z-index:2147483647;max-width:380px;padding:12px 14px;border:1px solid #ffffff24;border-radius:10px;background:${colors[tone]};color:#fff;font:600 14px/1.4 system-ui;box-shadow:0 12px 35px #0008}</style><div class="toast" role="status"></div>`;
  shadow.querySelector(".toast")!.textContent = message;
  (document.documentElement ?? document.body).append(root);
  window.setTimeout(() => root.remove(), 5000);
}

function showScanningDialog(file: File): { update: (message: string) => void; close: () => void } {
  const host = document.createElement("div");
  const shadow = host.attachShadow({ mode: "closed" });
  shadow.innerHTML = `<style>:host{all:initial}.veil{position:fixed;inset:0;z-index:2147483647;display:grid;place-items:center;padding:18px;background:#070a10dc;color:#f4f6fb;font:14px/1.45 system-ui}.card{width:min(100%,530px);border:1px solid #ffffff1c;border-radius:16px;background:#11151f;box-shadow:0 24px 70px #000;padding:24px}.eyebrow{color:#aeb8cb;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase}.title{margin:5px 0 7px;font-size:24px}.body{color:#aeb8cb;margin:0}.body strong{color:#f4f6fb}.progress{display:flex;align-items:center;gap:10px;margin-top:20px;border:1px solid #33d99255;background:#33d9920d;color:#b6f5d8;border-radius:9px;padding:12px}.spinner{width:16px;height:16px;flex:none;border:2px solid #33d99244;border-top-color:#33d992;border-radius:50%;animation:spin .8s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}.status{font-weight:700}.footnote{margin:14px 0 0;color:#6f7a90;font-size:12px}</style><div class="veil"><section class="card" role="status" aria-live="polite"><div class="eyebrow">HackSight AI local review</div><h1 class="title">Checking your image for sensitive information</h1><p class="body">Scanning <strong></strong> before it uploads — this happens on your device.</p><div class="progress"><span class="spinner"></span><span class="status">Starting scan…</span></div><p class="footnote">Nothing is sent anywhere during this step. You'll get a chance to review anything found before the upload continues.</p></section></div>`;
  shadow.querySelector(".body strong")!.textContent = file.name || "your image";
  const status = shadow.querySelector(".status")!;
  (document.documentElement ?? document.body).append(host);
  return { update: (message) => (status.textContent = message), close: () => host.remove() };
}

function withReplay(action: () => void): void {
  replayingUpload = true;
  try {
    action();
  } finally {
    replayingUpload = false;
  }
}

function replayFiles(files: File[], context: UploadContext): boolean {
  const transfer = new DataTransfer();
  files.forEach((file) => transfer.items.add(file));

  const replayViaInput = (): boolean => {
    if (!context.input) return false;
    try {
      withReplay(() => {
        context.input!.files = transfer.files;
        context.input!.dispatchEvent(new Event("input", { bubbles: true }));
        context.input!.dispatchEvent(new Event("change", { bubbles: true }));
      });
      return true;
    } catch {
      return false;
    }
  };

  // Prefer replaying the *same kind* of event the file actually arrived
  // as — that's what genuinely mirrors what the page's own upload logic is
  // wired to. Falling back to "any nearby file input" first (as this used
  // to do) can silently misfire on pages with more than one file input for
  // unrelated features (avatar upload, a different attach button, etc.):
  // the replay reports success, but nothing the person can see actually
  // happens, because that input has no listener tied to this upload flow.
  if (context.source === "input") {
    if (replayViaInput()) return true;
  }

  // Reviewing findings and (especially) generating a redacted copy takes
  // real time, and clicking a button in HackSight's own popup moves focus
  // there. By the time we replay, the page's own compose box is very often
  // no longer the focused element — and a lot of rich-text editors key
  // their paste/drop handling to whatever IS currently focused, quietly
  // ignoring anything dispatched elsewhere. Restoring focus to the actual
  // original target before replaying puts the page back in the same state
  // a real drop/paste would have found it in.
  const refocus = (destination: Element): void => {
    if (!destination.isConnected) return;
    if (destination instanceof HTMLElement) {
      try {
        destination.focus({ preventScroll: true });
      } catch {
        // Not every element is focusable — safe to ignore.
      }
    }
  };

  if (context.source === "drop" && context.target instanceof EventTarget) {
    const destination = editableRoot(context.target) ?? document.body;
    if (destination.isConnected) {
      refocus(destination);
      withReplay(() => destination.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: transfer })));
      return true;
    }
    // The original drop target no longer exists (the page re-rendered
    // while we were scanning/redacting) — a plain input replay is the only
    // thing left with any chance of working.
  }
  if (context.source === "paste" && context.target instanceof EventTarget) {
    const destination = editableRoot(context.target) ?? document.body;
    if (destination.isConnected) {
      refocus(destination);
      withReplay(() => destination.dispatchEvent(new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: transfer })));
      return true;
    }
  }

  // Last resort, for the rare case none of the above applied.
  return replayViaInput();
}

const SCAN_TIMEOUT_MS = 45_000;

/** Whatever the eventual root cause of a hang inside scanning (a stuck
 * worker, a wedged model load, anything else), the person should never be
 * stuck without feedback or need to reload the extension to try the next
 * photo. Race the scan against a hard ceiling so it always settles one way
 * or the other. */
function withScanTimeout<T>(work: Promise<T>): Promise<T> {
  return Promise.race([
    work,
    new Promise<T>((_, reject) =>
      setTimeout(
        () => reject(new Error("The local scan took too long and was stopped. Try again — this should not need an extension reload.")),
        SCAN_TIMEOUT_MS
      )
    ),
  ]);
}

async function reviewFiles(files: File[], context: UploadContext, settings: Settings, site: SiteId): Promise<void> {
  reviewInProgress = true;
  const approved: File[] = [];
  try {
    for (const file of files) {
      const dialog = showScanningDialog(file);
      activeScanDialog = dialog;
      let scan;
      try {
        scan = await withScanTimeout(scanLocally({ file, site, settings, onProgress: (label) => dialog.update(label) }));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Local scan failed.";
        const empty = scoreFindings([], "Unknown");
        // Do not turn an OCR/model/asset error into a green "safe" result.
        // The empty result remains only to preserve the response shape.
        scan = { result: empty, summary: makeFailedScanSummary(site, file.name, message), warning: message };
      } finally {
        dialog.close();
        if (activeScanDialog === dialog) activeScanDialog = null;
      }
      void send({ type: "scan:complete", summary: scan.summary });
      // A clean, completed scan should not interrupt the user. Replay the
      // original image automatically; the review dialog is reserved for
      // actual findings (or a scan failure, where safety is unknown).
      if (scan.summary.findings.length === 0 && !scan.summary.error) {
        approved.push(file);
        continue;
      }
      const decision = await openReview(file, scan.summary, scan.warning);
      if (decision.action === "cancel") {
        showToast("Upload cancelled. The original image was not replayed.", "warning");
        return;
      }
      approved.push(decision.file);
    }
    if (replayFiles(approved, context)) {
      showToast(approved.some((file, index) => file !== files[index]) ? "HackSight replayed a redacted image." : "HackSight continued your upload.", "success");
    } else {
      showToast("This site could not replay the selected upload. Download the safe copy and attach it manually.", "warning");
    }
  } finally {
    activeScanDialog?.close();
    activeScanDialog = null;
    reviewInProgress = false;
  }
}

function startReviewIfEnabled(files: File[], context: UploadContext, settings: Settings): boolean {
  const targetSite = currentSite(settings);
  if (!targetSite || !settings.enabled || settings.siteEnabled[targetSite.settingKey] === false) return false;
  if (files.length === 0 || !files.every(isSupportedImage)) return false;
  if (reviewInProgress) {
    showToast("HackSight is already reviewing another upload. This image was not sent.", "warning");
    return true;
  }
  void reviewFiles(files, context, settings, targetSite.site);
  return true;
}

/** Event propagation cannot wait on chrome.storage. Keep an in-memory copy so
 * capture listeners can pause the page synchronously before its upload code
 * consumes a File. */
function maybeIntercept(files: File[], context: UploadContext): boolean {
  if (settingsCache) return startReviewIfEnabled(files, context, settingsCache);
  if (files.length === 0 || !files.every(isSupportedImage)) return false;
  // The initial settings message normally resolves long before a user opens a
  // file picker. If it has not, choose privacy: pause this one upload until we
  // know whether protection is enabled instead of accidentally leaking it.
  void send<Settings>({ type: "settings:get" }).then((settings) => {
    settingsCache = settings;
    if (!startReviewIfEnabled(files, context, settings)) {
      showToast("HackSight is disabled for this site; the paused upload was not replayed.", "warning");
    }
  });
  return true;
}

void send<Settings>({ type: "settings:get" }).then((settings) => {
  settingsCache = settings;
});

chrome.storage.onChanged.addListener(() => {
  void send<Settings>({ type: "settings:get" }).then((settings) => {
    settingsCache = settings;
  });
});

document.addEventListener(
  "change",
  (event) => {
    if (replayingUpload) return;
    const target = realTarget(event);
    const input = target instanceof HTMLInputElement && target.type === "file" ? target : null;
    if (!input) return;
    const files = Array.from(input.files ?? []);
    if (!maybeIntercept(files, { input, target, source: "input" })) return;
    event.stopImmediatePropagation();
    input.value = "";
  },
  true
);

document.addEventListener(
  "drop",
  (event) => {
    if (replayingUpload) return;
    const target = realTarget(event);
    const files = Array.from(event.dataTransfer?.files ?? []);
    if (!maybeIntercept(files, { input: findInput(target), target, source: "drop" })) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    notifyDragEnded(target);
  },
  true
);

document.addEventListener(
  "paste",
  (event) => {
    if (replayingUpload) return;
    const clip = event.clipboardData;
    if (!clip) return;
    const files = extractImageFiles(clip);
    if (files.length === 0) return; // text/link/etc. paste — nothing for HackSight to review
    const target = realTarget(event);
    if (!maybeIntercept(files, { input: null, target, source: "paste" })) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  },
  true
);

/** Pasted images can arrive either as clipboardData.files directly (a plain
 * OS-level image copy) or as DataTransferItems of kind "file" (screenshots
 * and copies from many apps) — check both, images only. */
function extractImageFiles(clipboardData: DataTransfer): File[] {
  const direct = Array.from(clipboardData.files ?? []).filter(isSupportedImage);
  if (direct.length > 0) return direct;
  const fromItems: File[] = [];
  for (const item of Array.from(clipboardData.items ?? [])) {
    if (item.kind !== "file") continue;
    const file = item.getAsFile();
    if (file && isSupportedImage(file)) fromItems.push(file);
  }
  return fromItems;
}

/**
 * We deliberately swallow the real "drop" event above so the site never
 * receives the un-reviewed original file. But most drag-and-drop UIs (a
 * "Drop files here" overlay, a highlighted dropzone, etc.) also rely on
 * that same "drop" event — or a "dragleave" — to reset their own visual
 * state. Since that event never reaches them, the overlay can get stuck
 * showing indefinitely. Replaying a synthetic, file-less "dragleave" to the
 * usual listener targets lets the page's own cleanup logic run normally
 * without ever exposing the real file to it.
 */
function notifyDragEnded(originalTarget: EventTarget | null): void {
  const targets = new Set<EventTarget>([window, document]);
  if (originalTarget) targets.add(originalTarget);
  for (const target of targets) {
    target.dispatchEvent(new DragEvent("dragleave", { bubbles: true, cancelable: true, dataTransfer: new DataTransfer() }));
    // Some drop zones only clear their "dragging" UI state inside their own
    // onDrop handler (rather than on dragleave), and never see the real
    // drop we intercepted. A drop with zero files is safe to replay — the
    // page's handler runs and resets its own state, but there is nothing
    // in it for the page's upload logic to actually act on.
    target.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: new DataTransfer() }));
  }
}

function labelForTier(tier: ScanSummary["tier"]): string {
  return { safe: "Safe to Post", mostly_safe: "Mostly Safe", think_again: "Think Again", do_not_share: "Do Not Share" }[tier];
}

function escapeHtml(value: string): string {
  const element = document.createElement("span");
  element.textContent = value;
  return element.innerHTML;
}

function openReview(file: File, summary: ScanSummary, warning?: string): Promise<ReviewDecision> {
  return new Promise((resolve) => {
    const host = document.createElement("div");
    const shadow = host.attachShadow({ mode: "closed" });
    const tone = { safe: "#33d992", mostly_safe: "#ffb020", think_again: "#ff7a1a", do_not_share: "#ff3b4e" }[summary.tier];
    const findings = summary.findings
      .map(
        (finding) => `<li><strong>${escapeHtml(finding.label)}</strong><span>${escapeHtml(finding.maskedValue)}</span><em>Severity ${finding.severity}/10</em></li>`
      )
      .join("");
    // A PNG with no pixelated regions is just the original image in a new
    // file. Never present that as a "redacted" alternative, especially when
    // OCR failed and the scan result is unknown.
    const canRedact = summary.findings.length > 0 && !summary.error;
    shadow.innerHTML = `<style>
      :host{all:initial}.veil{position:fixed;inset:0;z-index:2147483647;display:grid;place-items:center;padding:18px;background:#070a10dc;color:#f4f6fb;font:14px/1.45 system-ui}.card{width:min(100%,610px);max-height:94vh;overflow:auto;border:1px solid #ffffff1c;border-radius:16px;background:#11151f;box-shadow:0 24px 70px #000;padding:24px}.eyebrow{color:#aeb8cb;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase}.heading{display:flex;align-items:flex-start;justify-content:space-between;gap:18px;margin-top:4px}.heading h1{margin:0;font-size:24px;line-height:1.15}.score{white-space:nowrap;border:1px solid ${tone};border-radius:999px;color:${tone};padding:7px 10px;font-weight:800}.body{color:#aeb8cb;margin:8px 0 18px}.warning{border:1px solid #ffb02077;background:#ffb02017;color:#ffd893;border-radius:9px;padding:10px 12px;margin:12px 0}.findings{margin:0;padding:0;list-style:none;display:grid;gap:8px}.findings li{display:grid;gap:2px;border:1px solid #ffffff18;border-radius:9px;padding:10px 12px;background:#090c12}.findings span{font-family:ui-monospace,monospace;color:#bdc7da}.findings em{font-style:normal;color:#8491a8;font-size:12px}.empty{border:1px solid #33d99255;background:#33d9920d;color:#b6f5d8;border-radius:9px;padding:12px}.actions{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:8px;margin-top:20px}.actions button{border:0;border-radius:8px;padding:10px 13px;font:700 14px system-ui;cursor:pointer;color:#fff;background:#303949}.actions .redact{background:#267f59}.actions .continue{background:#b94f28}.actions .cancel{background:#1b2331}@media(max-width:480px){.heading{display:block}.score{display:inline-block;margin-top:10px}.actions button{width:100%}}</style>
      <div class="veil"><section class="card" role="dialog" aria-modal="true" aria-labelledby="title"><div class="eyebrow">HackSight AI · local review</div><div class="heading"><h1 id="title">${labelForTier(summary.tier)}</h1><div class="score">${summary.score}% Safe-to-Share</div></div><p class="body">${escapeHtml(file.name || "Image")} · ${summary.findings.length} finding${summary.findings.length === 1 ? "" : "s"}</p>${warning ? `<p class="warning">${escapeHtml(warning)}</p>` : ""}${summary.findings.length ? `<ul class="findings">${findings}</ul>` : '<p class="empty">No known sensitive text was detected. Review the image yourself before sharing.</p>'}<div class="actions"><button class="cancel" type="button">Cancel</button><button class="download" type="button">Download redacted copy</button><button class="continue" type="button">Continue anyway</button><button class="redact" type="button">Use redacted version</button></div></section></div>`;
    if (!canRedact) {
      shadow.querySelector(".download")?.remove();
      shadow.querySelector(".redact")?.remove();
      if (summary.error) {
        const empty = shadow.querySelector(".empty");
        if (empty) empty.textContent = "Redaction is unavailable because the local scan did not complete. Cancel, or continue only if you have reviewed the image yourself.";
      }
    }
    const finish = (decision: ReviewDecision) => {
      host.remove();
      resolve(decision);
    };
    shadow.querySelector<HTMLButtonElement>(".cancel")!.onclick = () => finish({ action: "cancel" });
    shadow.querySelector<HTMLButtonElement>(".continue")!.onclick = () => finish({ action: "continue", file });
    if (canRedact) {
    shadow.querySelector<HTMLButtonElement>(".download")!.onclick = async (event) => {
      const button = event.currentTarget as HTMLButtonElement;
      button.disabled = true;
      try {
        const safe = await generateSafeImage(file, summary.findings);
        const stem = (file.name || "image").replace(/\.[^.]+$/, "");
        const url = URL.createObjectURL(safe.blob);
        const download = document.createElement("a");
        download.href = url;
        download.download = `${stem}-hacksight-redacted.png`;
        download.click();
        URL.revokeObjectURL(url);
        button.textContent = "Downloaded";
      } catch (error) {
        showToast(error instanceof Error ? error.message : "Could not create a safe image.", "warning");
      } finally {
        button.disabled = false;
      }
    };
    shadow.querySelector<HTMLButtonElement>(".redact")!.onclick = async (event) => {
      const button = event.currentTarget as HTMLButtonElement;
      button.disabled = true;
      button.textContent = "Redacting locally…";
      try {
        const safe = await generateSafeImage(file, summary.findings);
        const stem = (file.name || "image").replace(/\.[^.]+$/, "");
        finish({ action: "continue", file: new File([safe.blob], `${stem}-hacksight-redacted.png`, { type: "image/png" }) });
      } catch (error) {
        button.disabled = false;
        button.textContent = "Use redacted version";
        showToast(error instanceof Error ? error.message : "Could not create a safe image.", "warning");
      }
    };
    }
    (document.documentElement ?? document.body).append(host);
  });
}