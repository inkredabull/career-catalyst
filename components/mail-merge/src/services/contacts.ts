// Google Contacts / People API helpers.

import { COLS, SCRIPT_PROPS } from '../config/settings';
import { fetchMostRecentPost, generateZeitgeistyString } from './enrich-layer';

type PersonResource = GoogleAppsScript.People.Schema.Person;

export interface ContactDetails {
  email: string;
  mobile: string;
  linkedin: string;
  company: string;
}

// ── LinkedIn URL lookup ────────────────────────────────────────────────────────

export const getLinkedInUrlByName = (fullName: string): string | null => {
  const resp = People.People!.searchContacts({
    query: fullName,
    readMask: 'names,urls',
  });

  for (const r of resp.results ?? []) {
    for (const u of r.person?.urls ?? []) {
      if (u.value?.toLowerCase().includes('linkedin.com')) {
        return u.value;
      }
    }
  }

  console.log(`No LinkedIn URL found for ${fullName}`);
  return null;
};

// ── Full contact details ──────────────────────────────────────────────────────

export const getContactDetails = (fullName: string): ContactDetails => {
  const response = People.People!.searchContacts({
    query: fullName,
    pageSize: 1,
    readMask: 'emailAddresses,phoneNumbers,urls,organizations',
  });

  const result: ContactDetails = { email: '', mobile: '', linkedin: '', company: '' };

  if (!response.results?.length) {
    console.log(`No contacts found for: ${fullName}`);
    return result;
  }

  const person = response.results[0].person as PersonResource;

  if (person.emailAddresses?.length) {
    const homeEmail = person.emailAddresses.find(e => e.type === 'home');
    result.email = homeEmail?.value ?? person.emailAddresses[0].value ?? '';
  }

  if (person.phoneNumbers?.length) {
    const mobile = person.phoneNumbers.find(p => p.type === 'mobile' || p.type === 'cell');
    result.mobile = mobile?.value ?? person.phoneNumbers[0].value ?? '';
  }

  if (person.urls?.length) {
    const li = person.urls.find(
      u => u.type?.toLowerCase() === 'linkedin' || u.value?.toLowerCase().includes('linkedin.com')
    );
    result.linkedin = li?.value ?? '';
  }

  if ((person as unknown as Record<string, unknown>).organizations) {
    const orgs = (person as unknown as { organizations: { name?: string; current?: boolean }[] }).organizations;
    const current = orgs.find(o => o.current !== false) ?? orgs[0];
    result.company = current?.name ?? '';
  }

  return result;
};

// ── Sheet integration ─────────────────────────────────────────────────────────

const getMostRecentInteractionDate = (email: string): GoogleAppsScript.Base.Date | null => {
  const threads = GmailApp.search(`to:${email} OR from:${email}`, 0, 1);
  return threads.length > 0 ? threads[0].getLastMessageDate() : null;
};

export const fetchContactToSheet = (): void => {
  const sheet = SpreadsheetApp.getActiveSheet();
  const data = sheet.getDataRange().getValues() as string[][];
  const heads = data.shift() as string[];
  const recipientIdx  = heads.indexOf(COLS.RECIPIENT);
  const recentIdx     = heads.indexOf(COLS.RECENT);
  const fullNameIdx   = heads.indexOf(COLS.FULL_NAME);
  const firstNameIdx  = heads.indexOf(COLS.FIRST_NAME);
  const cellIdx       = heads.indexOf(COLS.CELL);
  const linkedInIdx   = heads.indexOf(COLS.LINKEDIN);
  const companyIdx    = heads.indexOf(COLS.COMPANY);
  const zeitgeistyIdx = heads.indexOf(COLS.ZEITGEISTY);

  if (recipientIdx === -1 || fullNameIdx === -1) {
    SpreadsheetApp.getUi().alert(`Sheet must have columns "${COLS.RECIPIENT}" and "${COLS.FULL_NAME}".`);
    return;
  }

  const zeitgeistyEnabled =
    PropertiesService.getScriptProperties().getProperty(SCRIPT_PROPS.ZEITGEISTY_ENABLED) === 'true';

  const enrichZeitgeisty = (rowIdx: number, linkedInUrl: string, firstName: string): void => {
    console.log(`[Zeitgeisty] Row ${rowIdx + 1}: enabled=${zeitgeistyEnabled} colIdx=${zeitgeistyIdx} hasUrl=${!!linkedInUrl}`);
    if (!zeitgeistyEnabled) { console.log('[Zeitgeisty] skip: ZEITGEISTY_ENABLED not true'); return; }
    if (zeitgeistyIdx === -1) { console.log('[Zeitgeisty] skip: no Zeitgeisty column in sheet'); return; }
    if (!linkedInUrl) { console.log('[Zeitgeisty] skip: no LinkedIn URL'); return; }
    const existing = String(data[rowIdx]?.[zeitgeistyIdx] ?? '').trim();
    if (existing) { console.log(`[Zeitgeisty] skip: already filled "${existing.slice(0, 40)}"`); return; }
    try {
      const postText = fetchMostRecentPost(linkedInUrl);
      console.log(`[Zeitgeisty] postText (${postText.length} chars): "${postText.slice(0, 200)}"`);
      if (!postText) { console.log('[Zeitgeisty] skip: no activity text from EnrichLayer'); return; }
      const zeitgeist = generateZeitgeistyString(postText, firstName, UrlFetchApp.fetch.bind(UrlFetchApp));
      if (zeitgeist) {
        console.log(`[Zeitgeisty] Row ${rowIdx + 1} written: "${zeitgeist.slice(0, 80)}"`);
        sheet.getRange(rowIdx + 2, zeitgeistyIdx + 1).setValue(zeitgeist);
      } else {
        console.log('[Zeitgeisty] skip: Claude returned empty string');
      }
    } catch (e) {
      console.log(`[Zeitgeisty] ERROR: ${e}`);
    }
  };

  let filled = 0;
  for (let i = 0; i < data.length; i++) {
    const row = data[i]!;
    const existingEmail = String(row[recipientIdx] ?? '').trim();

    if (existingEmail) {
      if (recentIdx !== -1) {
        const lastDate = getMostRecentInteractionDate(existingEmail);
        if (lastDate) sheet.getRange(i + 2, recentIdx + 1).setValue(lastDate);
      }
      enrichZeitgeisty(
        i,
        String(row[linkedInIdx] ?? '').trim(),
        String(row[firstNameIdx] ?? '').trim(),
      );
      filled++;
      continue;
    }

    if (!row[fullNameIdx]) continue;
    const fullName = String(row[fullNameIdx]);
    console.log(`[Do Lookup] Row ${i + 1}: looking up "${fullName}"`);
    const contact = getContactDetails(fullName);
    if (!contact.email) {
      console.log(`[Do Lookup] Row ${i + 1}: no email found for "${fullName}"`);
      continue;
    }

    console.log(`[Do Lookup] Row ${i + 1}: found email=${contact.email} linkedin=${contact.linkedin || '(none)'} company=${contact.company || '(none)'}`);
    sheet.getRange(i + 2, recipientIdx + 1).setValue(contact.email);
    if (cellIdx !== -1 && !row[cellIdx] && contact.mobile)
      sheet.getRange(i + 2, cellIdx + 1).setValue(contact.mobile);
    if (linkedInIdx !== -1 && !row[linkedInIdx] && contact.linkedin)
      sheet.getRange(i + 2, linkedInIdx + 1).setValue(contact.linkedin);
    if (companyIdx !== -1 && !row[companyIdx] && contact.company)
      sheet.getRange(i + 2, companyIdx + 1).setValue(contact.company);
    if (recentIdx !== -1) {
      const lastDate = getMostRecentInteractionDate(contact.email);
      if (lastDate) sheet.getRange(i + 2, recentIdx + 1).setValue(lastDate);
    }
    enrichZeitgeisty(
      i,
      contact.linkedin || String(row[linkedInIdx] ?? '').trim(),
      contact.email.split('@')[0],
    );
    filled++;
  }

  SpreadsheetApp.getActive().toast(`${filled} row(s) updated`, '✅ Lookup Complete', 4);
};

export const getLinkedInUrlToSheet = (): void => {
  const spreadsheet = SpreadsheetApp.getActive();
  const sheet = spreadsheet.getSheetByName('Data');
  if (!sheet) throw new Error("Sheet 'Data' not found");

  const data = sheet.getDataRange().getValues() as string[][];
  const headers = data.shift() as string[];
  const currentCell = sheet.getActiveCell();
  const rowIndex = currentCell.getRow();
  const row = sheet.getRange(rowIndex, 1, 1, headers.length).getValues()[0] as string[];

  const fullName = row[headers.indexOf(COLS.FULL_NAME)];
  currentCell.setValue(getLinkedInUrlByName(fullName));
};

// ── Warmup helpers ────────────────────────────────────────────────────────────

export const getLocalURL = (displayName: string): string =>
  `https://contacts.google.com/search/${encodeURIComponent(displayName).replace(/%20/g, '+')}`;

export const getWorkUrl = (person: PersonResource): string | null => {
  for (const urlObj of person.urls ?? []) {
    if (urlObj.type?.toLowerCase() === 'work') return urlObj.value ?? null;
  }
  return null;
};

export const getAllContacts = (): PersonResource[] => {
  let people: PersonResource[] = [];
  let pageToken: string | undefined;

  do {
    const response = People.People!.Connections!.list('people/me', {
      pageSize: 1000,
      personFields: 'names,emailAddresses,urls,memberships',
      pageToken,
    });
    if (response.connections?.length) people = people.concat(response.connections);
    pageToken = response.nextPageToken != null ? response.nextPageToken : undefined;
  } while (pageToken);

  return people;
};

interface ContactGroupInfo {
  id: string;
  name: string;
  groupType: string;
}

const getContactGroupInfo = (): ContactGroupInfo[] => {
  const response = People.ContactGroups!.list({ pageSize: 200 });
  return (response.contactGroups ?? []).map(g => ({
    // resourceName is "contactGroups/<id>"; contactGroupMembership.contactGroupId is just "<id>"
    id: (g.resourceName ?? '').replace('contactGroups/', ''),
    name: g.name ?? '',
    groupType: g.groupType ?? '',
  }));
};

export const shuffle = <T>(array: T[]): void => {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j] as T, array[i] as T];
  }
};

export interface WarmupContact {
  displayName: string;
  contactUrl: string;
  email: string;
}

export const pickRandomContacts = (count = 5): WarmupContact[] => {
  const props = PropertiesService.getScriptProperties();
  const rawPrefixes = props.getProperty(SCRIPT_PROPS.WARMUP_EXCLUDE_LABEL_PREFIXES) ?? '';
  const excludedPrefixes = rawPrefixes.split(',').map(p => p.trim()).filter(Boolean);
  const rawEmails = props.getProperty(SCRIPT_PROPS.WARMUP_EXCLUDE_EMAILS) ?? '';
  const excludedEmails = new Set(rawEmails.split(',').map(e => e.trim().toLowerCase()).filter(Boolean));

  const HARDCODED_EXCLUDED_LABELS = ['Archetype/Unhelpful'];

  const groups = getContactGroupInfo();
  const excludedIds = new Set(
    groups
      .filter(g =>
        HARDCODED_EXCLUDED_LABELS.includes(g.name) ||
        excludedPrefixes.some(prefix => g.name.startsWith(prefix))
      )
      .map(g => g.id)
  );
  const userGroupIds = new Set(
    groups.filter(g => g.groupType === 'USER_CONTACT_GROUP').map(g => g.id)
  );

  const all = getAllContacts().filter(contact => {
    if (!contact.names?.[0]?.displayName) return false;
    if (contact.emailAddresses?.some(e => excludedEmails.has((e.value ?? '').toLowerCase()))) return false;
    const memberships = contact.memberships ?? [];
    const userMemberships = memberships.filter(
      m => m.contactGroupMembership?.contactGroupId != null &&
           userGroupIds.has(m.contactGroupMembership.contactGroupId)
    );
    if (userMemberships.length === 0) return true;
    return !userMemberships.some(
      m => excludedIds.has(m.contactGroupMembership!.contactGroupId!)
    );
  });

  shuffle(all);
  return all.slice(0, count).map(contact => {
    const displayName = contact.names?.[0]?.displayName ?? 'No Name';
    const homeEmail = contact.emailAddresses?.find(e => e.type === 'home');
    const email = homeEmail?.value ?? contact.emailAddresses?.[0]?.value ?? '';
    return { displayName, contactUrl: getLocalURL(displayName), email };
  });
};

// ── Contact reclassification ──────────────────────────────────────────────────

export const reclassifySingleOtherAsHome = (): void => {
  let pageToken: string | undefined;

  do {
    const response = People.People!.Connections!.list('people/me', {
      personFields: 'names,emailAddresses',
      pageSize: 1000,
      pageToken,
    });

    for (const person of response.connections ?? []) {
      const emails = person.emailAddresses;
      if (!emails || emails.length !== 1) continue;
      const email = emails[0];
      if (email.type !== 'other') continue;

      email.type = 'home';
      try {
        People.People!.updateContact(
          { resourceName: person.resourceName, etag: person.etag, emailAddresses: emails },
          person.resourceName as string,
          { updatePersonFields: 'emailAddresses' }
        );
        console.log(`Updated ${person.resourceName} to "home" email`);
      } catch (e) {
        console.log(`Error updating ${person.resourceName}: ${e}`);
      }
    }

    pageToken = response.nextPageToken != null ? response.nextPageToken : undefined;
  } while (pageToken);
};
