// Google Contacts / People API helpers.

import { COLS, SCRIPT_PROPS } from '../config/settings';
import { fetchMostRecentPost, generateZeitgeistyString } from './enrich-layer';
import { clearProgress, logAndPush } from '../utils/progress';

type PersonResource = GoogleAppsScript.People.Schema.Person;

export interface ContactDetails {
  email: string;
  mobile: string;
  linkedin: string;
  company: string;
}

export interface ZeitgeistyCandidate {
  sheetRow: number;
  postText: string;
  postUrl: string;
  prompt: string;
  suggestion: string;
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

// ── Do Lookup dialog ──────────────────────────────────────────────────────────

const buildDoLookupHtml = (): string => {
  const runNow = [
    "window._shownCount=0;",
    "window._logDiv=document.getElementById('log');",
    "window._logDiv.textContent='';",
    "window._poll=function(){google.script.run.withSuccessHandler(function(lines){var all=lines||[];var fresh=all.slice(window._shownCount);if(fresh.length){if(window._shownCount>0)window._logDiv.textContent+='\\n';window._logDiv.textContent+=fresh.join('\\n');window._shownCount=all.length;window._logDiv.scrollTop=window._logDiv.scrollHeight;}}).withFailureHandler(function(){}).getSendProgress();};",
    "window._poll();",
    "window._timer=setInterval(window._poll,1000);",
    "window._renderCandidate=function(){var c=window._candidates[window._idx];document.getElementById('reviewCount').textContent='Reviewing '+(window._idx+1)+' of '+window._candidates.length;document.getElementById('postText').textContent=c.postText;var link=document.getElementById('postUrl');link.href=c.postUrl;link.textContent=c.postUrl;document.getElementById('suggestion').textContent=c.suggestion;document.getElementById('prompt').textContent=c.prompt;document.getElementById('edit').value=c.suggestion;};",
    "window._advance=function(){window._idx++;if(window._idx>=window._candidates.length){google.script.host.close();}else{window._renderCandidate();}};",
    "window._submitRow=function(){var c=window._candidates[window._idx];google.script.run.withSuccessHandler(window._advance).withFailureHandler(function(e){alert(e.message);}).applyZeitgeistyToRow(c.sheetRow,document.getElementById('edit').value);};",
    "google.script.run.withSuccessHandler(function(result){clearInterval(window._timer);window._poll();var candidates=(result&&result.candidates)||[];if(candidates.length===0){setTimeout(function(){google.script.host.close();},3000);}else{window._candidates=candidates;window._idx=0;document.getElementById('loading').style.display='none';document.getElementById('review').style.display='block';window._renderCandidate();}}).withFailureHandler(function(e){clearInterval(window._timer);window._poll();alert(e.message);google.script.host.close();}).doFetchContactToSheet();",
  ].join('');
  return `<!DOCTYPE html><html><head><base target="_top"><style>
body{font-family:sans-serif;padding:16px;min-width:320px}
#loading{text-align:center;padding:8px 0;color:#555;font-size:14px}
.spinner{display:inline-block;margin-right:6px;animation:spin 1s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
#log{margin-top:10px;height:200px;overflow-y:auto;background:#f7f7f7;border:1px solid #ddd;border-radius:3px;padding:6px;font-family:monospace;font-size:11px;white-space:pre-wrap;text-align:left}
#review{display:none}
#review h4{margin:10px 0 4px;font-size:12px;color:#666;text-transform:uppercase}
#review .box{background:#f7f7f7;border:1px solid #ddd;border-radius:3px;padding:6px;font-size:12px;white-space:pre-wrap;max-height:90px;overflow-y:auto}
#prompt{font-family:monospace;font-size:10px}
#edit{width:100%;box-sizing:border-box;font-size:13px;padding:6px;min-height:60px}
#reviewCount{font-weight:bold;margin-bottom:6px}
.review-btns{display:flex;gap:8px;justify-content:flex-end;margin-top:14px}
.review-btns button{padding:6px 16px;cursor:pointer}
</style></head><body>
<div id="loading">
<div><span class="spinner">⏳</span>Running lookup — please wait…</div>
<div id="log"></div>
</div>
<div id="review">
<div id="reviewCount"></div>
<h4>Most recent LinkedIn post</h4>
<div id="postText" class="box"></div>
<h4>Post URL</h4>
<div class="box"><a id="postUrl" href="#" target="_blank"></a></div>
<h4>Claude's suggestion</h4>
<div id="suggestion" class="box"></div>
<h4>Prompt sent to Claude</h4>
<div id="prompt" class="box"></div>
<h4>Zeitgeisty (editable)</h4>
<textarea id="edit"></textarea>
<div class="review-btns">
<button onclick="window._advance()">Skip</button>
<button onclick="window._submitRow()">Submit &amp; Next</button>
</div>
</div>
<script>${runNow}</script>
</body></html>`;
};

/** Menu entry: shows the Do Lookup progress dialog. */
export const fetchContactToSheet = (): void => {
  const html = HtmlService.createHtmlOutput(buildDoLookupHtml()).setWidth(560).setHeight(560);
  SpreadsheetApp.getUi().showModalDialog(html, 'Do Lookup');
};

/** Writes reviewed/edited Zeitgeisty text into a specific sheet row. */
export const applyZeitgeistyToRow = (sheetRow: number, text: string): void => {
  const sheet = SpreadsheetApp.getActiveSheet();
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0] as string[];
  const zeitgeistyIdx = headers.indexOf(COLS.ZEITGEISTY);
  if (zeitgeistyIdx === -1) throw new Error(`No "${COLS.ZEITGEISTY}" column found.`);
  sheet.getRange(sheetRow, zeitgeistyIdx + 1).setValue(text);
};

/** Called by the dialog; does the actual work with progress logging. */
export const doFetchContactToSheet = (): { filled: number; candidates: ZeitgeistyCandidate[] } => {
  clearProgress();
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
    throw new Error(`Sheet must have columns "${COLS.RECIPIENT}" and "${COLS.FULL_NAME}".`);
  }

  const zeitgeistyEnabled =
    PropertiesService.getScriptProperties().getProperty(SCRIPT_PROPS.ZEITGEISTY_ENABLED) === 'true';

  const candidates: ZeitgeistyCandidate[] = [];

  const enrichZeitgeisty = (rowIdx: number, linkedInUrl: string, firstName: string): void => {
    logAndPush(`[Zeitgeisty] Row ${rowIdx + 1}: enabled=${zeitgeistyEnabled} colIdx=${zeitgeistyIdx} hasUrl=${!!linkedInUrl}`);
    if (!zeitgeistyEnabled) { logAndPush('[Zeitgeisty] skip: ZEITGEISTY_ENABLED not true'); return; }
    if (zeitgeistyIdx === -1) { logAndPush('[Zeitgeisty] skip: no Zeitgeisty column in sheet'); return; }
    if (!linkedInUrl) { logAndPush('[Zeitgeisty] skip: no LinkedIn URL'); return; }
    const existing = String(data[rowIdx]?.[zeitgeistyIdx] ?? '').trim();
    if (existing) { logAndPush(`[Zeitgeisty] skip: already filled "${existing.slice(0, 40)}"`); return; }
    try {
      const post = fetchMostRecentPost(linkedInUrl);
      logAndPush(`[Zeitgeisty] postText (${post.text.length} chars): "${post.text.slice(0, 200)}"`);
      if (!post.text) { logAndPush('[Zeitgeisty] skip: no post text from browser scraper'); return; }
      const { prompt, result: zeitgeist } = generateZeitgeistyString(post.text, firstName, UrlFetchApp.fetch.bind(UrlFetchApp));
      if (zeitgeist) {
        logAndPush(`[Zeitgeisty] Row ${rowIdx + 1} ready for review: "${zeitgeist.slice(0, 80)}"`);
        candidates.push({
          sheetRow: rowIdx + 2,
          postText: post.text,
          postUrl: post.url,
          prompt,
          suggestion: zeitgeist,
        });
      } else {
        logAndPush('[Zeitgeisty] skip: Claude returned empty string');
      }
    } catch (e) {
      logAndPush(`[Zeitgeisty] ERROR: ${e}`);
    }
  };

  let filled = 0;
  for (let i = 0; i < data.length; i++) {
    const row = data[i]!;
    const existingEmail = String(row[recipientIdx] ?? '').trim();

    if (existingEmail) {
      logAndPush(`[Do Lookup] Row ${i + 1}: email already set (${existingEmail}), checking recent interaction`);
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
    logAndPush(`[Do Lookup] Row ${i + 1}: looking up "${fullName}"`);
    const contact = getContactDetails(fullName);
    if (!contact.email) {
      logAndPush(`[Do Lookup] Row ${i + 1}: no email found for "${fullName}"`);
      continue;
    }

    logAndPush(`[Do Lookup] Row ${i + 1}: found email=${contact.email} linkedin=${contact.linkedin || '(none)'} company=${contact.company || '(none)'}`);
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

  logAndPush(`Done — ${filled} row(s) updated`);
  SpreadsheetApp.getActive().toast(`${filled} row(s) updated`, '✅ Lookup Complete', 4);
  return { filled, candidates };
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
