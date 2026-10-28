// A headless Chrome driven over the DevTools protocol with node's own WebSocket: no puppeteer, no npm install.
// Used by run-axe.mjs (CI) and by local measurement scripts. Test-time only; nothing here reaches a reader.
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css",
  ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2", ".woff": "font/woff" };

export async function serve(dir) {
  const server = http.createServer((req, res) => {
    let f = path.join(dir, decodeURIComponent(req.url.split("?")[0]));
    if (f.endsWith(path.sep) || (fs.existsSync(f) && fs.statSync(f).isDirectory())) f = path.join(f, "index.html");
    fs.readFile(f, (err, data) => {
      if (err) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { "content-type": TYPES[path.extname(f)] ?? "application/octet-stream" });
      res.end(data);
    });
  }).listen(0, "127.0.0.1");
  await new Promise(r => server.on("listening", r));
  return { url: `http://127.0.0.1:${server.address().port}`, close: () => server.close() };
}

const CANDIDATES = [process.env.CHROME_BIN, "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser"].filter(Boolean);

export function findChrome() {
  const found = CANDIDATES.find(p => fs.existsSync(p));
  if (!found) throw new Error("no Chrome found; set CHROME_BIN");
  return found;
}

// Key names the protocol needs a virtual key code for; a single character is typed as itself.
const KEYS = { Tab: 9, Enter: 13, Escape: 27, " ": 32, ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40, Home: 36, End: 35 };

export async function launch() {
  const userDir = fs.mkdtempSync(path.join(os.tmpdir(), "chrome-"));
  const args = ["--headless", "--disable-gpu", "--remote-debugging-port=0", `--user-data-dir=${userDir}`, "--no-first-run",
    "--no-default-browser-check", "about:blank"];
  // GitHub's Ubuntu runners refuse Chrome's own sandbox for a non-root user.
  if (process.env.CI) args.unshift("--no-sandbox");
  const chrome = spawn(findChrome(), args, { stdio: ["ignore", "ignore", "pipe"] });
  const wsUrl = await new Promise((resolve, reject) => {
    let buf = "";
    chrome.stderr.on("data", d => { buf += d; const m = buf.match(/ws:\/\/[^\s]+/); if (m) resolve(m[0]); });
    chrome.on("exit", code => reject(new Error(`chrome exited ${code}: ${buf}`)));
    setTimeout(() => reject(new Error("chrome did not start: " + buf)), 20000);
  });
  const list = await (await fetch(wsUrl.replace("ws://", "http://").replace(/\/devtools\/browser\/.*/, "/json/list"))).json();
  const ws = new WebSocket(list.find(t => t.type === "page").webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.addEventListener("open", resolve); ws.addEventListener("error", reject); });

  let id = 0;
  const pending = new Map(), logs = [];
  ws.addEventListener("message", ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    if (m.method === "Runtime.consoleAPICalled" && ["error", "warning"].includes(m.params.type))
      logs.push(`console.${m.params.type}: ` + m.params.args.map(a => a.value ?? a.description).join(" "));
    if (m.method === "Runtime.exceptionThrown")
      logs.push("EXCEPTION " + (m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text));
    if (m.method === "Log.entryAdded" && m.params.entry.level === "error" && !/favicon/.test(m.params.entry.url ?? m.params.entry.text))
      logs.push("LOG " + m.params.entry.text + " " + (m.params.entry.url ?? ""));
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const i = ++id;
    pending.set(i, m => (m.error ? reject(new Error(`${method}: ${m.error.message}`)) : resolve(m.result)));
    ws.send(JSON.stringify({ id: i, method, params }));
  });
  await send("Runtime.enable"); await send("Log.enable"); await send("Page.enable");

  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const page = {
    send, logs, sleep,
    // opts: { mobile, touch, scale } for a tablet-like device; cpu: CPU throttling rate (1 = none).
    async viewport(width, height, { mobile = false, touch = false, scale = 1, cpu = 1, reducedMotion = false } = {}) {
      await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: scale, mobile });
      await send("Emulation.setTouchEmulationEnabled", { enabled: touch, ...(touch ? { maxTouchPoints: 5 } : {}) });
      // A touch device's scrollbars overlay the page; a Linux runner's headless Chrome would otherwise take 15 px of the
      // width, and the text-size bound would hold on one machine and not on another.
      await send("Emulation.setScrollbarsHidden", { hidden: touch });
      await send("Emulation.setCPUThrottlingRate", { rate: cpu });
      await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: reducedMotion ? "reduce" : "no-preference" }] });
    },
    async goto(url) {
      const loaded = new Promise(r => { const f = ev => { if (JSON.parse(ev.data).method === "Page.loadEventFired") { ws.removeEventListener("message", f); r(); } }; ws.addEventListener("message", f); });
      await send("Page.navigate", { url });
      await loaded;
      // The pages draw in a module that runs after load; fonts change the layout the probes measure.
      await page.eval("document.fonts.ready.then(() => true)");
      await sleep(400);
    },
    // Evaluate an expression (awaited) and return its value; a thrown error rejects.
    async eval(expression) {
      const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
      return r.result.value;
    },
    // A real key press through the browser's input pipeline, so Tab moves focus as it does for a user.
    async key(name, { shift = false } = {}) {
      const code = KEYS[name] ?? name.toUpperCase().charCodeAt(0);
      const base = { key: name, code: name.length === 1 ? `Key${name.toUpperCase()}` : name, windowsVirtualKeyCode: code, nativeVirtualKeyCode: code, modifiers: shift ? 8 : 0 };
      // Enter and Space carry a character, so the browser activates a focused button or checkbox on them.
      const text = name === "Enter" ? "\r" : name === " " ? " " : undefined;
      await send("Input.dispatchKeyEvent", { type: text ? "keyDown" : "rawKeyDown", ...base, ...(text ? { text } : {}) });
      await send("Input.dispatchKeyEvent", { type: "keyUp", ...base });
    },
    async screenshot(file, { fullPage = false } = {}) {
      const r = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: fullPage });
      fs.writeFileSync(file, Buffer.from(r.data, "base64"));
    }
  };
  return {
    page,
    // The profile goes once Chrome has exited; a leftover temp directory is not worth a failed run.
    close() {
      try { ws.close(); } catch {}
      chrome.once("exit", () => { try { fs.rmSync(userDir, { recursive: true, force: true }); } catch {} });
      chrome.kill();
    }
  };
}
