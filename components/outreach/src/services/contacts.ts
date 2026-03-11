// Google Contacts / People API helpers.

type PersonResource = GoogleAppsScript.People.Schema.Person;

export interface ContactDetails {
  email: string;
  mobile: string;
  linkedin: string;
}

// ── LinkedIn URL lookup ────────────────────────────────────────────────────────

export function getLinkedInUrlByName(fullName: string): string | null {
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

  Logger.log('No LinkedIn URL found for %s', fullName);
  return null;
}

// ── Full contact details ──────────────────────────────────────────────────────

export function getContactDetails(fullName: string): ContactDetails {
  const response = People.People!.searchContacts({
    query: fullName,
    pageSize: 1,
    readMask: 'emailAddresses,phoneNumbers,urls',
  });

  const result: ContactDetails = { email: '', mobile: '', linkedin: '' };

  if (!response.results?.length) {
    Logger.log('No contacts found for: %s', fullName);
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

  return result;
}

// ── Sheet integration ─────────────────────────────────────────────────────────

export function fetchContactToSheet(): void {
  const spreadsheet = SpreadsheetApp.getActive();
  const sheet = spreadsheet.getSheetByName('Data');
  if (!sheet) throw new Error("Sheet 'Data' not found");

  const data = sheet.getDataRange().getValues() as string[][];
  const headers = data.shift() as string[];
  const currentCell = sheet.getActiveCell();
  const rowIndex = currentCell.getRow();
  const row = sheet.getRange(rowIndex, 1, 1, headers.length).getValues()[0] as string[];

  const fullName = row[headers.indexOf('Full')];
  const contact = getContactDetails(fullName);

  currentCell.setValue(contact.email);
  currentCell.offset(0, 1).setValue(contact.mobile);
  currentCell.offset(0, 2).setValue(contact.linkedin);
}

export function getLinkedInUrlToSheet(): void {
  const spreadsheet = SpreadsheetApp.getActive();
  const sheet = spreadsheet.getSheetByName('Data');
  if (!sheet) throw new Error("Sheet 'Data' not found");

  const data = sheet.getDataRange().getValues() as string[][];
  const headers = data.shift() as string[];
  const currentCell = sheet.getActiveCell();
  const rowIndex = currentCell.getRow();
  const row = sheet.getRange(rowIndex, 1, 1, headers.length).getValues()[0] as string[];

  const fullName = row[headers.indexOf('Full')];
  currentCell.setValue(getLinkedInUrlByName(fullName));
}

// ── Warmup helpers ────────────────────────────────────────────────────────────

export function getLocalURL(displayName: string): string {
  return `https://contacts.google.com/search/${encodeURIComponent(displayName).replace(/%20/g, '+')}`;
}

export function getWorkUrl(person: PersonResource): string | null {
  for (const urlObj of person.urls ?? []) {
    if (urlObj.type?.toLowerCase() === 'work') return urlObj.value ?? null;
  }
  return null;
}

export function getAllContacts(): PersonResource[] {
  let people: PersonResource[] = [];
  let pageToken: string | undefined;

  do {
    const response = People.People!.Connections!.list('people/me', {
      pageSize: 1000,
      personFields: 'names,emailAddresses,urls',
      pageToken,
    });
    if (response.connections?.length) people = people.concat(response.connections);
    pageToken = response.nextPageToken != null ? response.nextPageToken : undefined;
  } while (pageToken);

  return people;
}

export function shuffle<T>(array: T[]): void {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j] as T, array[i] as T];
  }
}

export function pickRandomContacts(count = 5): string {
  const all = getAllContacts();
  shuffle(all);
  const selected = all.slice(0, count);

  return selected
    .map(contact => {
      const displayName = contact.names?.[0]?.displayName ?? 'No Name';
      return `${displayName}\n${getLocalURL(displayName)}`;
    })
    .join('\n\n');
}

// ── Contact reclassification ──────────────────────────────────────────────────

export function reclassifySingleOtherAsHome(): void {
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
        Logger.log('Updated %s to "home" email', person.resourceName);
      } catch (e) {
        Logger.log('Error updating %s: %s', person.resourceName, e);
      }
    }

    pageToken = response.nextPageToken != null ? response.nextPageToken : undefined;
  } while (pageToken);
}
