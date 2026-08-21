# SMS Bridge

Send real SMS/iMessage from your own phone number, through macOS Messages.app.

No Twilio. No carrier hacks. No vendor lock-in.

## Architecture

```
Google Sheets
   ↓
Apps Script (UrlFetch)          ← components/mail-merge
   ↓
Public HTTPS endpoint (ngrok)
   ↓
unified-server :3000            ← mounts this component's POST /send
   ↓
AppleScript
   ↓
Messages.app
   ↓
SMS from your iPhone number
```

From the recipient's point of view, it looks like you typed the text yourself.

## This is a library, not a server

It exports a handler; `components/unified-server` mounts it:

```js
const { handleSend } = require('@inkredabull/career-catalyst-sms-bridge');
app.post('/send', handleSend);
```

It used to be a standalone server on port 3334 that reverse-proxied `/extract`,
`/llm` and `/generate-blurb` to unified-server, so a single ngrok tunnel could
front both processes. That extra hop is gone: unified-server now serves those
routes natively *and* `/send`, so there is one process and one tunnel.

`handleSend` is a bare `RequestHandler` rather than an express `Router` on
purpose — Router instances are express-major-version specific, and this way the
component has no runtime dependency on express at all (it appears only as a
type-only import).

## Exports

| Export | Purpose |
| --- | --- |
| `handleSend` | `POST /send` handler. Body: `{ to, message }`. |
| `requireSendAuth` | Shared-secret guard, mounted in front of `handleSend`. |
| `sendViaMessages(handle, message)` | Promise-returning send. Resolves `{ service, elapsedMs }`. |
| `normalizeToHandle(input)` | Coerce a phone number or email into a Messages.app buddy handle. |
| `buildAppleScript()` | The iMessage-then-SMS AppleScript, exported for testing. |
| `loadSendSecret()` | Resolve the shared secret (env var, then dotfile). |

## Authentication

`/send` can text from your personal phone number and is reachable from the
public internet whenever the ngrok tunnel is up, so it requires a shared
secret on every request:

```
X-SMS-Bridge-Token: <secret>
```

The secret is read per request from, in order:

1. `SMS_BRIDGE_SECRET` in the environment
2. `.sms-bridge-secret` — a gitignored dotfile at the repo root

Because it's read per request, rotating it does **not** require restarting
unified-server.

### Setup

```bash
cp .sms-bridge-secret.example .sms-bridge-secret
openssl rand -hex 32 >> .sms-bridge-secret   # or edit the placeholder line
```

Blank lines and `#` comments are ignored; the first remaining line is the
secret.

### It fails closed

With no secret configured, `/send` returns **503** rather than running
unauthenticated. Responses are **401** for a missing or wrong token, **202**
on success.

### Rotating the secret

`components/mail-merge` is a Google Apps Script bundle with no runtime access
to repo files, so the secret is baked in at build time by webpack
`DefinePlugin` — exactly how `NGROK_TUNNEL_URL` already works. After changing
the secret you must rebuild and redeploy that component or its SMS sending
will start 401ing:

```bash
npm run deploy --workspace=@inkredabull/career-catalyst-mail-merge
```

The bundle lands in the gitignored `dist/`, so the secret is not committed.

### Why `/send` returns 202 before doing anything

`osascript` against Messages.app routinely takes seconds. The caller reaches
this route through ngrok from Apps Script, whose `UrlFetchApp` will time out and
retry if the connection is held open. Responding `202 accepted` immediately and
doing the work afterwards avoids every timeout and gateway error — failures are
reported in the server log, not the HTTP response. Don't "fix" this into an
awaited handler.

### Why `normalizeToHandle` is lenient

It passes through anything it can't confidently normalize and lets Messages.app
reject it, because it also has to accept email handles for iMessage. This
differs deliberately from `components/mail-merge/src/services/sms.ts`
`normalizePhoneNumber`, which throws on anything that isn't a 10-digit US
number — that component only ever sends to known-good sheet data.

## Building and testing

```bash
npm run build --workspace=@inkredabull/career-catalyst-sms-bridge
npm run test  --workspace=@inkredabull/career-catalyst-sms-bridge
```

unified-server `require`s the compiled `dist/`, so this must be built before
starting it. Root `npm run build --workspaces` covers it — `sms-bridge` sorts
before `unified-server`, so the ordering works out.

To exercise it end to end, start unified-server and post to it:

```bash
npm run unified-server
curl -X POST localhost:3000/send \
  -H 'content-type: application/json' \
  -H "X-SMS-Bridge-Token: $(grep -v '^#' .sms-bridge-secret | grep -v '^$' | head -1)" \
  -d '{"to":"+15551234567","message":"hello"}'
```

## Requirements

- macOS with Messages.app signed in
- iPhone with Text Message Forwarding enabled (for the SMS fallback)
- Automation permission granted to the host process for Messages.app
- Node.js >= 18

## License

MIT
