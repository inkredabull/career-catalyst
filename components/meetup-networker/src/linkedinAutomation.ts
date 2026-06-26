import { LinkedInProfile } from './profileLookup.js';
import {
  generateConnectScript,
  loadTemplate,
  buildMessage,
  injectScript,
} from '@inkredabull/career-catalyst-linkedin-automation';

export async function openMessageModal(
  profile: LinkedInProfile,
  tabIndex: number,
  eventName: string
): Promise<void> {
  const message = buildMessage(loadTemplate(), {
    firstName: profile.firstName || profile.name.split(' ')[0],
    summary:   profile.condensedSummary || profile.domain || 'your industry',
    event:     eventName,
  });
  console.log(`  Sending connect invite for ${profile.name} (tab ${tabIndex})...`);
  injectScript(tabIndex, generateConnectScript(message));
}
