import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getOpenReqs } from "../src/index";

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  const authHeader = req.headers["authorization"];
  if (authHeader !== `Bearer ${process.env["CRON_SECRET"]}`) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const webAppUrl = process.env["WEB_APP_URL"] ?? "";
  try {
    await getOpenReqs(webAppUrl);
    res.status(200).json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      "cron handler failed:",
      message,
      err instanceof Error ? err.stack : "",
    );
    res.status(500).json({ error: message });
  }
}
