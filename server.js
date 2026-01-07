import express from "express";
import bodyParser from "body-parser";
import { exec } from "child_process";
import fs from "fs";

const app = express();
const PORT = 3333;

// ---- Basic request logging ----
app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    const ms = Date.now() - start;
    console.log(`${new Date().toISOString()} ${req.method} ${req.url} ${res.statusCode} ${ms}ms`);
  });
  next();
});

app.use(bodyParser.json());

// ---- Health check ----
app.get("/health", (_req, res) => res.status(200).send("ok"));

// ---- SMS endpoint ----
app.post("/send", (req, res) => {
  const { to, message } = req.body || {};

  console.log("→ Incoming SMS request:", { to, message });

  // Always respond immediately so ngrok / Apps Script never timeout
  res.status(202).send("accepted");

  if (!to || !message) {
    console.error("✗ Missing 'to' or 'message'");
    return;
  }

  const safeMsg = String(message).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const safeTo = String(to).replace(/\\/g, "\\\\").replace(/"/g, '\\"');

  const script = `
tell application "Messages"
  send "${safeMsg}" to buddy "${safeTo}"
end tell
`;

  const start = Date.now();

  exec(
    `osascript -e '${script.replace(/'/g, "'\\''")}'`,
    { timeout: 15000 },
    (err, stdout, stderr) => {
      const ms = Date.now() - start;

      if (err) {
        console.error("✗ osascript failed:", err.toString());
        if (stderr) console.error("stderr:", stderr);
      } else {
        console.log(`✓ Message sent in ${ms}ms`);
        if (stdout) console.log("stdout:", stdout.trim());
      }
    }
  );
});

// ---- Boot ----
app.listen(PORT, () => {
  console.log(`🚀 SMS bridge listening on http://localhost:${PORT}`);
});

