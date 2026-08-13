/**
 * Some sites' "attach"/"+" upload buttons call window.showOpenFilePicker()
 * directly instead of using a plain <input type="file">. That call never
 * dispatches any DOM event — drop and paste do, a real file input's
 * "change" does, but this API is just a Promise the page's own script
 * awaits directly. A passive event listener in the isolated content script
 * world structurally cannot see it.
 *
 * This file runs in the page's own JavaScript context instead (MV3's
 * "world": "MAIN" — see manifest.config.ts and background/index.ts, which
 * register/inject it alongside the normal isolated-world content script on
 * every site HackSight is active on). It deliberately does as little as
 * possible here: wrap the real API, hand the picked file off to the
 * isolated-world script (which has chrome.runtime, chrome.storage, and the
 * actual scan pipeline) via a CustomEvent, wait for its verdict, and either
 * return the real handle, a substitute wrapping a redacted file, or reject
 * the same way a real user cancellation would.
 *
 * File and Blob objects are platform objects, not tied to either script's
 * own JS realm, so they pass through a CustomEvent's `detail` between the
 * main world and the isolated world without any special handling.
 */
(() => {
  type PickerHandle = FileSystemFileHandle;
  type Verdict = { action: "continue"; file: File } | { action: "cancel" };

  const w = window as unknown as {
    showOpenFilePicker?: (options?: unknown) => Promise<PickerHandle[]>;
  };
  const original = w.showOpenFilePicker;
  if (typeof original !== "function") return; // API not supported here — nothing to wrap

  let requestCounter = 0;

  function reviewFile(file: File): Promise<Verdict> {
    const requestId = `hacksight-${Date.now()}-${requestCounter++}`;
    return new Promise((resolve) => {
      const responseType = `hacksight:file-picker-result:${requestId}`;
      const onResult = (event: Event) => {
        window.removeEventListener(responseType, onResult);
        resolve((event as CustomEvent<Verdict>).detail);
      };
      window.addEventListener(responseType, onResult);
      window.dispatchEvent(new CustomEvent("hacksight:file-picker-review", { detail: { requestId, file } }));
    });
  }

  // A best-effort stand-in for a real FileSystemFileHandle. Covers what the
  // overwhelming majority of "pick a file, read it, upload it" callers
  // actually use (.kind, .name, .getFile()). It will not satisfy
  // `instanceof FileSystemFileHandle`, and methods this doesn't implement
  // (createWritable, move, permission queries, etc.) are not available — a
  // site relying on those for a redacted substitute is a real, known
  // limitation of intercepting this specific API from outside the page.
  function substituteHandle(real: PickerHandle, file: File): PickerHandle {
    return {
      kind: "file",
      name: file.name,
      getFile: async () => file,
      isSameEntry: (other: FileSystemHandle) => real.isSameEntry(other),
    } as unknown as PickerHandle;
  }

  w.showOpenFilePicker = async (options?: unknown) => {
    const handles = await original.call(w, options);
    const reviewed: PickerHandle[] = [];
    for (const handle of handles) {
      if (handle.kind !== "file") {
        reviewed.push(handle);
        continue;
      }
      const file = await handle.getFile();
      const decision = await reviewFile(file);
      if (decision.action === "cancel") {
        // Mirrors what the browser itself throws when the person cancels
        // the native picker, so the page's own cancel handling still works.
        throw new DOMException("The user aborted a request.", "AbortError");
      }
      reviewed.push(decision.file === file ? handle : substituteHandle(handle, decision.file));
    }
    return reviewed;
  };
})();
