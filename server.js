import express from "express";
import bodyParser from "body-parser";
import { execFile } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import crypto from "crypto";

const app = express();
const PORT = 3334;

app.use(bodyParser.json());

// ---- Basic request logging ----
app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    const ms = Date.now() - start;
    console.log(`${new Date().toISOString()} ${req.method} ${req.url} ${res.statusCode} ${ms}ms`);
  });
  next();
});

// ---- Health check ----
app.get("/health", (_req, res) => res.status(200).send("ok"));

// ---- Proxy: career-catalyst unified-server routes ----
const UNIFIED_SERVER = "http://localhost:3000";

app.get("/extract", async (req, res) => {
  const url = new URL("/extract", UNIFIED_SERVER);
  url.search = new URLSearchParams(req.query).toString();
  try {
    const upstream = await fetch(url.toString());
    const html = await upstream.text();
    res.status(upstream.status).set("content-type", "text/html").send(html);
  } catch (e) {
    res.status(502).send(`<p>Upstream error: ${e.message}</p>`);
  }
});

app.get("/llm", async (req, res) => {
  const url = new URL("/llm", UNIFIED_SERVER);
  url.search = new URLSearchParams(req.query).toString();
  try {
    const upstream = await fetch(url.toString());
    const data = await upstream.json();
    res.status(upstream.status).json(data);
  } catch (e) {
    res.status(502).json({ error: `upstream error: ${e.message}` });
  }
});

app.post("/generate-blurb", async (req, res) => {
  try {
    const upstream = await fetch(`${UNIFIED_SERVER}/generate-blurb`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(req.body),
    });
    const data = await upstream.json();
    res.status(upstream.status).json(data);
  } catch (e) {
    res.status(502).json({ error: `upstream error: ${e.message}` });
  }
});

// ---- Helpers ----
function normalizeToHandle(toRaw) {
  const s = String(toRaw || "").trim();
  if (!s) return s;

  // email → iMessage only
  if (s.includes("@")) return s;

  // already E.164-ish
  if (s.startsWith("+")) return "+" + s.slice(1).replace(/[^\d]/g, "");

  // strip punctuation
  const digits = s.replace(/[^\d]/g, "");

  // assume US if 10 digits
  if (digits.length === 10) return `+1${digits}`;

  // 11 digits starting with 1
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;

  // fallback
  return s;
}

function writeTempAppleScript(contents) {
  const id = crypto.randomBytes(8).toString("hex");
  const filePath = path.join(os.tmpdir(), `sms-bridge-${id}.applescript`);
  fs.writeFileSync(filePath, contents, "utf8");
  return filePath;
}

// ---- Send endpoint ----
app.post("/send", (req, res) => {
  const { to, message } = req.body || {};
  const requestId = crypto.randomBytes(6).toString("hex");

  console.log(`→ [${requestId}] Incoming send request:`, { to, message });

  // Respond immediately so ngrok / Apps Script never timeout
  res.status(202).send("accepted");

  if (!to || !message) {
    console.error(`✗ [${requestId}] Missing 'to' or 'message'`);
    return;
  }

  const handle = normalizeToHandle(to);
  const msg = String(message);

  // Strategy: try iMessage first, then fall back to SMS
  const script = `
on run argv
  set theHandle to item 1 of argv
  set theMsg to item 2 of argv

  tell application "Messages"
    try
      set imService to 1st service whose service type is iMessage
      set imBuddy to buddy theHandle of imService
      send theMsg to imBuddy
      return "IMESSAGE"
    on error errMsg number errNum
      try
        set smsService to 1st service whose service type is SMS
        set smsBuddy to buddy theHandle of smsService
        send theMsg to smsBuddy
        return "SMS"
      on error errMsg2 number errNum2
        error "BOTH_FAILED: " & errNum & " " & errMsg & " | " & errNum2 & " " & errMsg2
      end try
    end try
  end tell
end run
`.trim();

  const appleScriptPath = writeTempAppleScript(script);
  const start = Date.now();

  execFile(
    "osascript",
    [appleScriptPath, handle, msg],
    { timeout: 60000 },
    (err, stdout, stderr) => {
      const ms = Date.now() - start;

      // cleanup temp file
      try {
        fs.unlinkSync(appleScriptPath);
      } catch {}

      if (err) {
        console.error(`✗ [${requestId}] osascript failed after ${ms}ms:`, err.message);
        if (stderr) console.error("stderr:", stderr);
        return;
      }

      const used = (stdout || "").trim() || "UNKNOWN";
      console.log(`✓ [${requestId}] Sent via ${used} in ${ms}ms → ${handle}`);
      if (stderr) console.log("stderr:", stderr);
    }
  );
});

// ---- Boot ----
app.listen(PORT, () => {
  console.log(`🚀 SMS bridge listening on http://localhost:${PORT}`);
});
