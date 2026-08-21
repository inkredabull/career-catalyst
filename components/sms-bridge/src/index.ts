/**
 * SMS bridge — sends SMS/iMessage through macOS Messages.app.
 *
 * This is a library, not a server. components/unified-server mounts
 * `handleSend` at POST /send so a single process sits behind a single ngrok
 * tunnel; see that component's README for the topology.
 */

export { handleSend } from './handlers/send';
export {
  buildAppleScript,
  normalizeToHandle,
  sendViaMessages,
} from './services/messages';
export type { DeliveryService, SendResult } from './services/messages';
