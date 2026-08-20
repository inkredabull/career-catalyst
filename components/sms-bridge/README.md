# SMS Bridge

Turn Google Sheets into a real SMS sender — from your own phone number.

No Twilio number. No carrier hacks. No vendor lock-in.

## Architecture

```
Google Sheets
   ↓
Apps Script (UrlFetch)
   ↓
Public HTTPS endpoint (ngrok)
   ↓
Node.js on your Mac
   ↓
AppleScript
   ↓
Messages.app
   ↓
SMS from your iPhone number
```

From the recipient's point of view, it looks like you typed the text yourself.

## Key Features

- **Uses your real phone number** - Messages appear to come from you
- **Zero per-SMS fees** - No third-party SMS services required
- **Fully private** - All messages route through your own devices
- **No vendor dependency risk** - Complete control over your infrastructure
- **Integrates with existing tools** - Works with Google Sheets and other apps

## How It Works

### 1. Node.js SMS Bridge

A tiny Node server running on your Mac receives JSON requests, triggers AppleScript, and sends messages via Messages.app.

**Design principle:** Return HTTP immediately, do the work async. This single decision avoids every timeout, gateway error, and flaky edge case.

### 2. ngrok for Public Access

```bash
ngrok http 3333
```

No firewall spelunking. No router configs. Just works.

### 3. Apps Script Integration

```javascript
UrlFetchApp.fetch(NGROK_URL + "/send", {
  method: "post",
  contentType: "application/json",
  payload: JSON.stringify({ to, message })
});
```

Now a spreadsheet can text.

### 4. Phone Number Normalization

```
(415) 823-0858 → +14158230858
```

Proper validation prevents future headaches.

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start the server:
   ```bash
   node server.js
   ```

3. Expose the server with ngrok:
   ```bash
   ngrok http 3333
   ```

4. Configure your Google Apps Script with the ngrok URL

## Use Cases

This powers lightweight ops workflows:
- Follow-ups
- CRM-style communications
- Team notifications
- Automated reminders

All with almost no surface area.

## Requirements

- macOS with Messages.app
- iPhone with SMS capability
- Node.js
- ngrok (or similar tunneling service)

## License

MIT
