# SMS Bridge

Turn Google Sheets into a real SMS sender — from your own phone number.

No Twilio. No carrier hacks. No vendor lock-in.

## Architecture

```
Google Sheets
   ↓
Apps Script (UrlFetch)          ← components/mail-merge
   ↓
Public HTTPS endpoint (ngrok)
   ↓
Node.js on your Mac             ← this component, port 3334
   ↓
AppleScript
   ↓
Messages.app
   ↓
SMS from your iPhone number
```

From the recipient's point of view, it looks like you typed the text yourself.

## Key Features

- **Uses your real phone number** — messages appear to come from you
- **Zero per-SMS fees** — no third-party SMS services required
- **Fully private** — all messages route through your own devices
- **No vendor dependency risk** — complete control over your infrastructure

## Routes

| Route | Purpose |
| --- | --- |
| `POST /send` | `{ to, message }` → Messages.app. Tries iMessage, falls back to SMS. |
| `GET /health` | Liveness check, returns `ok`. |
| `GET /extract` | Proxied to unified-server. |
| `GET /llm` | Proxied to unified-server. |
| `POST /generate-blurb` | Proxied to unified-server. |

### Why the proxy routes exist

ngrok free-tier gives you one tunnel. `components/unified-server` (port 3000)
also needs to be publicly reachable for JD-extractor tracking links. Rather
than run two tunnels and keep two URLs in sync across the root `.env` and the
Vercel env var of the same name, the tunnel terminates here and this component
forwards those three routes upstream.

### Why `/send` returns 202 before doing anything

`osascript` against Messages.app routinely takes seconds. Both callers reach
this server through ngrok, and Apps Script's `UrlFetchApp` will time out and
retry if the connection is held open. Responding `202 accepted` immediately and
doing the work afterwards avoids every timeout and gateway error — failures are
reported in the server log, not the HTTP response. Don't "fix" this into an
awaited handler.

## Configuration

Both are optional; the defaults work for local development. They're read from
the repo-root `.env`.

| Var | Default | Notes |
| --- | --- | --- |
| `SMS_BRIDGE_PORT` | `3334` | Must stay in sync with the localhost fallback in `components/alerts/src/notify.ts`. |
| `UNIFIED_SERVER_URL` | `http://localhost:3000` | Where the proxy routes forward. |

## Running

From the repo root:

```bash
npm run build --workspace=@inkredabull/career-catalyst-sms-bridge
npm run sms-bridge          # runs the built dist/
npm run sms-bridge:dev      # ts-node, loads the root .env
```

Then expose it:

```bash
ngrok http 3334
```

and put the resulting URL in `NGROK_TUNNEL_URL` in the root `.env` (and in
Vercel, for `components/alerts`).

For the proxy routes to work, start unified-server too: `npm run unified-server`.

## Requirements

- macOS with Messages.app signed in
- iPhone with Text Message Forwarding enabled (for the SMS fallback)
- Automation permission granted to your terminal for Messages.app
- Node.js >= 18
- ngrok (or similar) for public access

## Known gap

`/send` is unauthenticated. Once tunneled, anyone who learns the URL can send
texts from your personal number. Adding a shared-secret header requires a
matching change in `components/mail-merge/src/services/sms.ts` plus a GAS
redeploy, so it's tracked separately.

## License

MIT
