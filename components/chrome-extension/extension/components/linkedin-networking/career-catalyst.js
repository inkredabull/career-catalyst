// Career Catalyst - LinkedIn Networking Content Script
// Handles LinkedIn connection extraction, mutual connections, and feed post saves

const log = (...a) => console.log('[CAREER CATALYST]', ...a);

// Track if extraction is already running to avoid duplicates
let linkedInExtractionRunning = false;

// Track profiles that have already been prompted to avoid duplicate confirmations
let promptedProfiles = new Set();

// Track if we've already processed a search page to avoid duplicates
// Store the URL of the processed search to make it URL-specific
let processedSearchPageUrl = null;

// Track pagination state for multi-page extraction
let paginationState = {
  isExtracting: false,
  allResults: [],
  currentPage: 1,
  targetProfileUrl: '',
  targetFirstName: '',
  targetJobId: '',
  searchDoc: null   // cached once on first page, reused for all subsequent pages
};

// Strip query params from a LinkedIn /in/ URL
function cleanLinkedInUrl(url) {
  try {
    const u = new URL(url);
    // Keep only the /in/<slug> path, no query string or hash
    return u.origin + u.pathname.replace(/\/$/, '');
  } catch {
    return url;
  }
}

async function findAndClickByText(tag, text, delayMs = 0) {
  if (delayMs) await new Promise(r => setTimeout(r, delayMs));
  const el = Array.from(document.querySelectorAll(tag)).find(e => e.textContent.trim() === text);
  if (el) { el.click(); return true; }
  return false;
}

// Mutual connections is always-on; use the right-click context menu to trigger.

// ===== LinkedIn Company People Page Extraction =====

function detectLinkedInCompanyPeople() {
  const url = window.location.href;
  return url.includes('linkedin.com/company/') && url.includes('/people/');
}

function runLinkedInConnectionExtraction() {

  log("LinkedIn Connection Extractor - Starting profile clicks...");

  // Try multiple selectors to find LinkedIn profile cards
  var clickableElements = [];

  // Multiple selector patterns to try
  var selectorPatterns = [
    // Standard company people page
    ".org-people-profile-card a[href*='/in/']",
    ".org-people-profile-card__profile-info a[href*='/in/']",
    // Alternative patterns
    "[data-control-name='people_profile_card'] a[href*='/in/']",
    ".people-card a[href*='/in/']",
    ".entity-result a[href*='/in/']",
    // More generic LinkedIn profile links
    "a[href*='linkedin.com/in/']",
    "a[href*='/in/'][href*='linkedin']"
  ];

  // Track unique URLs to avoid duplicates
  var seenUrls = new Set();

  // Try each selector pattern
  for (let pattern of selectorPatterns) {
    var foundElements = document.querySelectorAll(pattern);
    log(`Trying selector "${pattern}": found ${foundElements.length} elements`);

    if (foundElements.length > 0) {
      for (let i = 0; i < foundElements.length; i++) {
        var profileLink = foundElements[i];
        var profileUrl = profileLink.href;

        // Skip if we've already seen this URL
        if (seenUrls.has(profileUrl)) {
          continue;
        }
        seenUrls.add(profileUrl);

        var card = profileLink.closest('.org-people-profile-card, .entity-result, .people-card, [data-control-name="people_profile_card"]');

        var nameElement = card ? card.querySelector('.t-black, .entity-result__title-text, .t-16, .t-bold') : null;
        var headlineElement = card ? card.querySelector('.t-14, .entity-result__primary-subtitle, .t-12') : null;

        var name = nameElement ? nameElement.innerText.trim() : `Profile ${clickableElements.length + 1}`;
        var headline = headlineElement ? headlineElement.innerText.trim() : "";

        log(`Found unique connection: ${name} - ${headline}`);
        clickableElements.push({
            element: profileLink,
            name: name,
            headline: headline
        });
      }
      break; // Stop trying other patterns if we found some elements
    }
  }

  log(`Found ${clickableElements.length} connection profiles.`);

  if (clickableElements.length > 0) {
    log(`LinkedIn networking: Found ${clickableElements.length} profiles. Use context menu to extract.`);
    linkedInExtractionRunning = false;
  } else {
    log("No clickable connection profiles found with any selector pattern.");
    linkedInExtractionRunning = false;
  }
}

// Auto-detect LinkedIn company people pages and run extraction
function checkForLinkedInExtraction() {
  if (detectLinkedInCompanyPeople()) {
    if (!linkedInExtractionRunning) {
      linkedInExtractionRunning = true;
      // Clear previous session's prompted profiles when starting fresh extraction
      promptedProfiles.clear();
      log('LinkedIn company people page detected - waiting 5 seconds before extraction...');
      setTimeout(() => {
        runLinkedInConnectionExtraction();
      }, 5000);
    }
  }
}

// ===== LinkedIn Profile Mutual Connections Handler =====

function detectLinkedInProfile() {
  const url = window.location.href;
  return url.includes('linkedin.com/in/');
}

function getProfilePersonName() {
  try {
    // Try specific h1 selectors first, then h2 fallback for profiles where LinkedIn uses h2
    const selectors = [
      'h1.text-heading-xlarge',
      'h1.inline.t-24.v-align-middle.break-words',
      '.pv-text-details__left-panel h1',
      'div.ph5 h1',
      '[data-anonymize="person-name"]'
    ];

    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element && element.innerText && element.innerText.trim().length > 0) {
        return element.innerText.trim();
      }
    }

    // Broad h1/h2 scan: find shortest element whose text looks like a person's name
    // (2+ words, not a nav/title label, under 60 chars)
    const nameRe = /^[A-ZÀ-Ö][a-zA-ZÀ-öø-ÿ'\-]+(?: [A-ZÀ-Ö][a-zA-ZÀ-öø-ÿ'\-]+)+$/;
    for (const el of document.querySelectorAll('h1, h2')) {
      const text = (el.innerText || '').trim();
      if (text.length > 0 && text.length < 60 && nameRe.test(text)) {
        return text;
      }
    }

    // Fallback: try to extract from document title
    const title = document.title;
    if (title && !title.includes('LinkedIn')) {
      // Title format is usually "Name | LinkedIn" or "Name - LinkedIn"
      const nameMatch = title.match(/^(.+?)\s*[\|\-]\s*LinkedIn/);
      if (nameMatch) {
        return nameMatch[1].trim();
      }
    }

    return 'Unknown Profile';
  } catch (error) {
    log('Error getting profile person name:', error);
    return 'Unknown Profile';
  }
}

function findAndClickMutualConnections() {

  log('Looking for mutual connections link...');

  // Don't run on search results pages
  if (window.location.href.includes('/search/results/')) {
    log('Skipping mutual connections search - already on search results page');
    return;
  }

  // Get the current profile person's name from the page
  var profileName = getProfilePersonName();
  log(`Profile person name: "${profileName}"`);

  // Find the mutual connections link — covers all cases:
  //   "Sandra and Josh are mutual connections"  (2 connections, no "other")
  //   "Jane and 5 other mutual connections"     (many connections)
  //   "Jane is a mutual connection"             (1 connection)
  //   "X connections in common"                (alternate LinkedIn phrasing)
  var mutualConnectionLink = null;

  var allLinks = document.querySelectorAll('a');
  var connectionLinkCandidates = [];
  for (let link of allLinks) {
    var linkText = (link.innerText || link.textContent || '').replace(/\s+/g, ' ').trim();
    var lt = linkText.toLowerCase();
    // Must NOT be a plain profile /in/ link
    if (link.href.includes('/in/')) continue;
    if (lt.includes('mutual connection') || lt.includes('connections in common') || lt.includes('connection in common')) {
      mutualConnectionLink = link;
      log(`Found mutual connections link: "${linkText.slice(0, 80)}"`);
      break;
    }
    // Collect any link that mentions "connection" for diagnostics
    if (lt.includes('connection')) {
      connectionLinkCandidates.push(`"${linkText.slice(0, 60)}" → ${link.href.slice(0, 80)}`);
    }
  }

  if (!mutualConnectionLink && connectionLinkCandidates.length > 0) {
    log('No exact mutual-connections link found. Nearby "connection" links:', connectionLinkCandidates.join(' | '));
  }

  if (mutualConnectionLink) {
    log('Found mutual connections link, clicking...');
    log(`Link URL: ${mutualConnectionLink.href}`);

    // Store the current profile's information for extraction
    var currentUrl = window.location.href;
    var nameToStore = profileName;

    // Extract first name from URL as fallback
    var urlMatch = currentUrl.match(/linkedin\.com\/in\/([^\/\?]+)/);
    if (urlMatch) {
      var urlSlug = urlMatch[1];
      var firstName = urlSlug
        .split('-')[0]
        .replace(/\d+/g, '')
        .trim();

      if (firstName.length > 0) {
        var extractedFirstName = firstName.charAt(0).toUpperCase() + firstName.slice(1).toLowerCase();
        if (profileName === 'Unknown Profile') {
          nameToStore = extractedFirstName;
        }
      }
    }

    // Prompt for Job ID before navigating away
    var jobIdInput = window.prompt('Job ID for these mutual connections? (leave blank to skip)') || '';

    // Store in localStorage for mutual connections extraction
    localStorage.setItem('linkedin_target_profile_url', cleanLinkedInUrl(currentUrl));
    localStorage.setItem('linkedin_target_profile_name', nameToStore);
    localStorage.setItem('linkedin_target_job_id', jobIdInput.trim());
    localStorage.setItem('linkedin_extraction_timestamp', Date.now().toString());
    // Set flag to indicate we're expecting a mutual connections page load
    localStorage.setItem('linkedin_awaiting_mutual_connections', 'true');

    log(`Stored profile info - name: "${nameToStore}", URL: "${currentUrl}"`);

    mutualConnectionLink.click();
  } else {
    log('No mutual connections link found on this profile');
  }
}

async function extractMutualConnectionNames() {

  log('Extracting mutual connection names...');

  try {
    // Get the target profile URL and stored metadata from localStorage
    var targetProfileUrl = localStorage.getItem('linkedin_target_profile_url') || '';
    log(`Target profile URL: "${targetProfileUrl}"`);

    var targetJobId = localStorage.getItem('linkedin_target_job_id') || '';

    // Prefer the stored full name; fall back to parsing the URL slug
    var storedName = localStorage.getItem('linkedin_target_profile_name') || '';
    var targetFirstName = 'Unknown';

    if (storedName && storedName !== 'Unknown Profile') {
      // Use the first word of the stored full name
      targetFirstName = storedName.split(/\s+/)[0];
    } else if (targetProfileUrl) {
      var urlMatch = targetProfileUrl.match(/linkedin\.com\/in\/([^\/\?]+)/);
      if (urlMatch) {
        var urlSlug = urlMatch[1];
        var firstName = urlSlug.split('-')[0].replace(/\d+/g, '').trim();
        if (firstName.length > 0) {
          targetFirstName = firstName.charAt(0).toUpperCase() + firstName.slice(1).toLowerCase();
        }
      }
    }

    log(`Target first name: "${targetFirstName}", Job ID: "${targetJobId}"`);

    // Initialize pagination state — restore from localStorage if resuming after URL navigation
    if (!paginationState.isExtracting) {
      var savedState = localStorage.getItem('linkedin_pagination_state');
      if (savedState) {
        try {
          var s = JSON.parse(savedState);
          paginationState.isExtracting = true;
          paginationState.allResults = s.allResults || [];
          paginationState.seenNames = new Set(s.seenNames || []);
          paginationState.currentPage = s.currentPage || 1;
          paginationState.targetProfileUrl = s.targetProfileUrl || targetProfileUrl;
          paginationState.targetFirstName = s.targetFirstName || targetFirstName;
          paginationState.targetJobId = s.targetJobId || targetJobId;
          paginationState.searchDoc = null;
          localStorage.removeItem('linkedin_pagination_state');
          log(`Resuming pagination: page ${paginationState.currentPage}, ${paginationState.allResults.length} results so far`);
        } catch(e) { savedState = null; }
      }
      if (!savedState) {
        paginationState.isExtracting = true;
        paginationState.allResults = [];
        paginationState.seenNames = new Set();
        paginationState.currentPage = 1;
        paginationState.targetProfileUrl = targetProfileUrl;
        paginationState.targetFirstName = targetFirstName;
        paginationState.targetJobId = targetJobId;
        paginationState.searchDoc = null;
      }
    }

    // LinkedIn renders its SPA content inside a full-viewport same-origin iframe
    // (data-testid="interop-iframe", src="/preload/"). We must query that document.
    var RESULT_SELECTOR = '[data-chameleon-result-urn], [data-view-name="search-entity-result-universal-template"]';

    async function findSearchDocument(timeoutMs) {
      var deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        // Prefer the interop iframe LinkedIn uses for SPA content
        var iframe = document.querySelector('iframe[data-testid="interop-iframe"]');
        if (iframe) {
          try {
            var iDoc = iframe.contentDocument || (iframe.contentWindow && iframe.contentWindow.document);
            if (iDoc && iDoc.querySelector(RESULT_SELECTOR)) {
              log('Found results in interop-iframe');
              return iDoc;
            }
          } catch(e) { /* cross-origin guard, shouldn't happen for linkedin.com */ }
        }
        // Fallback: top-level document (for non-iframe renders)
        if (document.querySelector(RESULT_SELECTOR)) {
          log('Found results in top-level document');
          return document;
        }
        await new Promise(function(r) { setTimeout(r, 300); });
      }
      // Timeout — return whatever we have
      var iframe = document.querySelector('iframe[data-testid="interop-iframe"]');
      if (iframe) {
        try {
          var iDoc = iframe.contentDocument || (iframe.contentWindow && iframe.contentWindow.document);
          if (iDoc) return iDoc;
        } catch(e) {}
      }
      return document;
    }

    var searchDoc;
    if (paginationState.searchDoc) {
      searchDoc = paginationState.searchDoc;
    } else {
      searchDoc = await findSearchDocument(10000);
      paginationState.searchDoc = searchDoc;
    }

    // Extract connections from current page
    var nameElements = [];

    // Primary: target each result item by stable data attribute, extract name from the
    // name link's span[dir="ltr"] > span[aria-hidden="true"] (observed in 2026 DOM)
    var resultItems = Array.from(searchDoc.querySelectorAll(RESULT_SELECTOR));

    if (resultItems.length > 0) {
      var seenHrefs = new Set();
      resultItems.forEach(function(item) {
        // Find all profile links in this result item
        var links = Array.from(item.querySelectorAll('a[data-test-app-aware-link][href*="/in/"], a[href*="/in/"]'));
        for (var link of links) {
          var href = link.href || '';
          if (seenHrefs.has(href)) continue;
          // Look for span[dir="ltr"] > span[aria-hidden="true"] which holds just the name
          var nameSpan = link.querySelector('span[dir="ltr"] span[aria-hidden="true"]') ||
                         link.querySelector('span[aria-hidden="true"]');
          if (!nameSpan) continue;
          var text = (nameSpan.textContent || '').replace(/<!---->/g, '').trim();
          // Skip degree badges ("• 1st", "• 2nd"), empty strings, and UI labels
          if (!text || text.startsWith('•') || text.toLowerCase().includes('view ')) continue;
          seenHrefs.add(href);
          nameElements.push({ innerText: text, linkedInUrl: href });
          break; // one name per result item
        }
      });
    }

    // Fallback: try legacy class-based selectors
    if (nameElements.length === 0) {
      var legacySelectors = [
        '.artdeco-entity-lockup__title a span[aria-hidden="true"]',
        'a[data-view-name="search-result-lockup-title"]',
        '[data-view-name="people-search-result"] a[href*="/in/"]',
        'li.reusable-search__result-container .entity-result__title-text a span[aria-hidden="true"]',
        '.search-results-container .entity-result__title-text a span[aria-hidden="true"]',
        '.entity-result__title-text a[href*="/in/"]',
        '.t-16 a span>span:not(.visually-hidden)',
        'div.mb1 a span>span:not(.visually-hidden)'
      ];
      for (var selector of legacySelectors) {
        var elements = Array.from(searchDoc.querySelectorAll(selector));
        if (elements.length > 0) {
          var candidates = elements.map(function(el) {
            var anchor = el.closest ? el.closest('a[href*="/in/"]') : (el.tagName === 'A' ? el : null);
            return {
              innerText: (el.textContent || el.innerText || '').replace(/<!---->/g, '').trim(),
              linkedInUrl: anchor ? anchor.href : ''
            };
          }).filter(function(el) { return el.innerText.length > 0; });
          if (candidates.length > 0) {
            nameElements = candidates;
            break;
          }
        }
      }
    }

    if (nameElements.length === 0) {
      log('Could not find mutual connections with any known selector');
      outputAccumulatedResults();
      return;
    }

    // Add current page results to accumulated results (deduplicated)
    if (!paginationState.seenNames) paginationState.seenNames = new Set();
    log(`Page ${paginationState.currentPage}: Found ${nameElements.length} connections`);
    nameElements.forEach((element) => {
      var mutualConnectionName = element.innerText.trim();
      if (mutualConnectionName && mutualConnectionName.length > 0 && !paginationState.seenNames.has(mutualConnectionName)) {
        paginationState.seenNames.add(mutualConnectionName);
        paginationState.allResults.push({ name: mutualConnectionName, linkedInUrl: element.linkedInUrl || '' });
      }
    });

    // Paginate via URL (?page=N) — far more reliable than hunting DOM pagination buttons
    if (nameElements.length > 0) {
      var nextPageNum = paginationState.currentPage + 1;
      var nextUrl = new URL(window.location.href);
      nextUrl.searchParams.set('page', nextPageNum);

      // Persist accumulated state across the page navigation
      localStorage.setItem('linkedin_pagination_state', JSON.stringify({
        allResults: paginationState.allResults,
        seenNames: Array.from(paginationState.seenNames),
        currentPage: nextPageNum,
        targetProfileUrl: paginationState.targetProfileUrl,
        targetFirstName: paginationState.targetFirstName
      }));
      localStorage.setItem('linkedin_awaiting_mutual_connections', 'true');

      log(`Navigating to page ${nextPageNum}: ${nextUrl.toString()}`);
      window.location.href = nextUrl.toString();
    } else {
      log('No results on this page — extraction complete.');
      outputAccumulatedResults();
    }

  } catch (error) {
    console.error('Error extracting mutual connection names:', error);
    outputAccumulatedResults();
  }
}


async function outputAccumulatedResults() {
  if (paginationState.allResults.length === 0) {
    log('No results to output');
    paginationState.isExtracting = false;
    return;
  }

  const total = paginationState.allResults.length;
  const pages = paginationState.currentPage;
  log(`✅ Extraction complete! ${total} mutual connections across ${pages} page(s).`);

  // Build rows for server + fallback CSV
  const rows = paginationState.allResults.map(r => ({
    fullName:   r.name,
    personName: paginationState.targetFirstName,
    personUrl:  cleanLinkedInUrl(paginationState.targetProfileUrl),
    linkedInUrl: r.linkedInUrl ? cleanLinkedInUrl(r.linkedInUrl) : '',
    jobId:      paginationState.targetJobId || ''
  }));

  // Fallback CSV still logged to console
  var csv = 'Full,PersonName,PersonURL,LinkedIn\n';
  rows.forEach(r => {
    csv += `"${r.fullName}","${r.personName}","${r.personUrl}","${r.linkedInUrl}"\n`;
  });
  log(csv);

  // POST to unified server → Google Sheet
  try {
    const resp = await fetch('http://localhost:3000/append-mutual-connections', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rows })
    });
    const data = await resp.json();
    if (data.success) {
      log(`✅ Appended ${data.appended} row(s) to Google Sheet`);
      alert(`✅ ${data.appended} mutual connection(s) appended to Google Sheet (${pages} page(s) extracted).`);
    } else {
      throw new Error(data.error || 'Unknown server error');
    }
  } catch (err) {
    console.warn('Sheet append failed:', err.message);
    // Fall back to clipboard copy
    const textarea = document.createElement('textarea');
    textarea.value = csv;
    textarea.style.cssText = 'position:fixed;left:-999999px;top:-999999px';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    try {
      document.execCommand('copy');
      alert(`✅ ${total} connection(s) extracted.\n⚠️ Sheet append failed (${err.message}).\nCSV copied to clipboard as fallback.`);
    } catch {
      alert(`✅ ${total} connection(s) extracted.\n⚠️ Sheet append failed (${err.message}).\nCSV logged to console.`);
    }
    document.body.removeChild(textarea);
  }

  // Reset pagination state
  paginationState.isExtracting = false;
  paginationState.allResults = [];
  paginationState.seenNames = new Set();
  paginationState.currentPage = 1;
}

// Custom overlay prompt — replaces confirm() which LinkedIn SPA navigation dismisses automatically
function showExtractionPrompt(profileName, onConfirm, onCancel) {
  // Remove any existing prompt
  var existing = document.getElementById('cc-extraction-prompt');
  if (existing) existing.remove();

  var overlay = document.createElement('div');
  overlay.id = 'cc-extraction-prompt';
  overlay.style.cssText = [
    'position:fixed', 'top:0', 'left:0', 'width:100%', 'height:100%',
    'background:rgba(0,0,0,0.55)', 'z-index:99999999',
    'display:flex', 'align-items:center', 'justify-content:center',
    'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif'
  ].join(';');

  var box = document.createElement('div');
  box.style.cssText = [
    'background:#fff', 'border-radius:12px', 'padding:28px 32px',
    'max-width:420px', 'width:90%', 'box-shadow:0 8px 32px rgba(0,0,0,0.25)',
    'text-align:center'
  ].join(';');

  box.innerHTML = `
    <div style="font-size:22px;margin-bottom:8px;">🔗</div>
    <div style="font-size:16px;font-weight:600;color:#1a1a1a;margin-bottom:10px;">
      Extract mutual connections for<br><span style="color:#0a66c2">${profileName}</span>?
    </div>
    <div style="font-size:13px;color:#555;margin-bottom:22px;line-height:1.5;">
      This will navigate to the mutual connections page and extract the list of shared connections.
    </div>
    <div style="display:flex;gap:10px;justify-content:center;">
      <button id="cc-cancel-btn" style="padding:10px 24px;border-radius:20px;border:1px solid #ccc;background:#fff;color:#444;font-size:14px;cursor:pointer;">Skip</button>
      <button id="cc-confirm-btn" style="padding:10px 24px;border-radius:20px;border:none;background:#0a66c2;color:#fff;font-size:14px;font-weight:600;cursor:pointer;">Extract</button>
    </div>
  `;

  overlay.appendChild(box);
  document.body.appendChild(overlay);

  function cleanup() { overlay.remove(); }

  document.getElementById('cc-confirm-btn').addEventListener('click', function() {
    cleanup();
    onConfirm();
  });
  document.getElementById('cc-cancel-btn').addEventListener('click', function() {
    cleanup();
    onCancel();
  });
  // Clicking the backdrop also cancels
  overlay.addEventListener('click', function(e) {
    if (e.target === overlay) { cleanup(); onCancel(); }
  });
}

// Handles the mutual connections search page that results from findAndClickMutualConnections.
// Profile page detection is no longer automatic — use the right-click context menu instead.
function checkForLinkedInProfile() {
  var url = window.location.href;
  var isSearchPage = url.includes('/search/results/');

  if (!isSearchPage) return;

  {
    // Check if we're awaiting mutual connections extraction
    const awaitingExtraction = localStorage.getItem('linkedin_awaiting_mutual_connections');

    log('🔍 DEBUG: On search page');
    log('🔍 DEBUG: URL:', url);
    log('🔍 DEBUG: Awaiting extraction flag:', awaitingExtraction);
    log('🔍 DEBUG: Already processed URL:', processedSearchPageUrl);

    if (awaitingExtraction === 'true') {
      // Check if we've already processed this exact search URL
      if (processedSearchPageUrl === url) {
        log('Already processed this search page URL, skipping...');
        return;
      }

      log('LinkedIn mutual connections search page detected - auto-triggering extraction...');
      log('Auto-triggered extraction detected - clearing flag and proceeding...');
      localStorage.removeItem('linkedin_awaiting_mutual_connections');

      // Mark this URL as processed
      processedSearchPageUrl = url;

      // Kick off extraction — MutationObserver inside will wait for results
      log('Triggering extraction (MutationObserver will wait for results)...');
      setTimeout(() => {
        extractMutualConnectionNames();
      }, 500);
    } else {
      log('No awaiting extraction flag found - user may have navigated here manually');
    }
  }
}

// ===== LinkedIn Feed Post Save Detection =====

function detectLinkedInFeed() {
  const url = window.location.href;
  const isLinkedInFeed = url.includes('linkedin.com/feed');
  log('LinkedIn Feed: URL check:', { url, isLinkedInFeed });
  return isLinkedInFeed;
}

function initLinkedInFeedMonitoring() {

  if (!detectLinkedInFeed()) {
    log('LinkedIn Feed: Not on feed page, skipping monitoring');
    return;
  }

  log('LinkedIn Feed: ✅ Monitoring for post saves activated!');

  // Monitor network requests for LinkedIn save API calls
  setupLinkedInNetworkMonitoring();
}

function setupLinkedInNetworkMonitoring() {
  log('LinkedIn Feed: Setting up postMessage listener for injected script...');

  // Listen for messages from the injected script
  window.addEventListener('message', function(event) {
    // Only accept messages from the same origin
    if (event.origin !== window.location.origin) {
      return;
    }

    // Check if this is a LinkedIn post save message
    if (event.data && event.data.type === 'LINKEDIN_POST_SAVED') {
      log('LinkedIn Feed: 🎯 Received post save message from injected script!', event.data);

      const { activityUrn, url, timestamp } = event.data;
      if (activityUrn) {
        log('LinkedIn Feed: Processing saved post with activity URN:', activityUrn);

        // Small delay to let the UI update, then find and process the post
        setTimeout(() => {
          findAndProcessSavedPost(activityUrn);
        }, 1000);
      }
    }
  });

  log('LinkedIn Feed: ✅ PostMessage listener set up successfully');
}

function findAndProcessSavedPost(activityUrn) {
  try {
    log('LinkedIn Feed: Looking for post with activity URN:', activityUrn);

    // Find the post element by looking for elements with the activity URN
    const postElement = findPostByActivityUrn(activityUrn);

    if (postElement) {
      log('LinkedIn Feed: Found post element for saved post!');
      extractAndCreateReminderFromPost(postElement);
    } else {
      log('LinkedIn Feed: Could not find post element for activity URN:', activityUrn);
    }
  } catch (error) {
    console.error('LinkedIn Feed: Error processing saved post:', error);
  }
}

function findPostByActivityUrn(activityUrn) {
  // Try to find post by data-urn attribute
  const postElement = document.querySelector(`[data-urn*="${activityUrn}"]`);
  if (postElement) {
    log('LinkedIn Feed: Found post by data-urn attribute');
    return postElement;
  }

  return null;
}

function extractAndCreateReminderFromPost(postElement) {
  try {
    log('LinkedIn Feed: Extracting post information...');

    const postInfo = extractLinkedInPostInfo(postElement);

    if (postInfo && postInfo.author) {
      log('LinkedIn Feed: Creating reminder for saved post...', postInfo);

      chrome.runtime.sendMessage({
        action: 'createLinkedInPostReminder',
        postInfo: postInfo
      }, response => {
        if (response && response.success) {
          log('LinkedIn Feed: ✅ Reminder created successfully!');
          showLinkedInFeedNotification('📌 Reminder created for saved post');
        } else {
          log('LinkedIn Feed: ❌ Failed to create reminder:', response?.error);
        }
      });
    } else {
      log('LinkedIn Feed: ⚠️ Could not extract enough post information');
    }
  } catch (error) {
    console.error('LinkedIn Feed: Error creating reminder:', error);
  }
}

function extractLinkedInPostInfo(postElement) {
  try {
    const postInfo = {
      author: '',
      title: '',
      url: '',
      content: ''
    };

    // Extract author name
    const authorElement = postElement.querySelector('.update-components-actor__name, .feed-shared-actor__name');
    if (authorElement) {
      postInfo.author = authorElement.innerText.trim();
    }

    // Extract post content
    const contentElement = postElement.querySelector('.feed-shared-text, .update-components-text');
    if (contentElement) {
      const contentText = contentElement.innerText.trim();
      postInfo.content = contentText.substring(0, 200);
      const contentPreview = contentText.substring(0, 50);
      postInfo.title = `LinkedIn post by ${postInfo.author}: ${contentPreview}`;
    } else {
      postInfo.title = `LinkedIn post by ${postInfo.author}`;
    }

    log('LinkedIn Feed: Extracted post info:', postInfo);
    return postInfo;
  } catch (error) {
    console.error('LinkedIn Feed: Error extracting post info:', error);
    return null;
  }
}

function showLinkedInFeedNotification(message) {
  // Create a simple notification element
  const notification = document.createElement('div');
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: #0a66c2;
    color: white;
    padding: 16px 24px;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    z-index: 999999;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;
    font-size: 14px;
    font-weight: 500;
  `;
  notification.textContent = message;
  document.body.appendChild(notification);

  // Remove after 3 seconds
  setTimeout(() => {
    notification.style.transition = 'opacity 0.3s';
    notification.style.opacity = '0';
    setTimeout(() => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification);
      }
    }, 300);
  }, 3000);
}

// Initialize LinkedIn feed monitoring when on feed page
function checkForLinkedInFeed() {
  log('LinkedIn Feed: checkForLinkedInFeed() called');
  if (detectLinkedInFeed()) {
    log('LinkedIn Feed: Detected LinkedIn feed page, initializing monitoring...');
    initLinkedInFeedMonitoring();
  } else {
    log('LinkedIn Feed: Not on LinkedIn feed page, skipping...');
  }
}

// ===== Message Handlers =====

// Listen for messages from background script (context menu actions)
async function addToMailMerge() {
  const fullName = getProfilePersonName() !== 'Unknown Profile' ? getProfilePersonName() : '';
  const firstName = fullName ? fullName.split(/\s+/)[0] : '';
  const profileUrl = cleanLinkedInUrl(window.location.href);

  if (!firstName) {
    alert('⚠️ Could not extract name from this profile. Make sure you are on a LinkedIn /in/ profile page.');
    return;
  }

  const jobIdInput = window.prompt(
    `Add "${firstName}" to mail merge sheet.\n\nJob ID (leave blank to skip):`,
    ''
  );
  if (jobIdInput === null) return; // user cancelled

  const row = {
    fullName: fullName,
    personName: '',
    personUrl: '',
    linkedInUrl: profileUrl,
    jobId: jobIdInput.trim()
  };

  try {
    const resp = await fetch('http://localhost:3000/append-mutual-connections', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rows: [row] })
    });
    const data = await resp.json();
    if (data.success) {
      log(`✅ Added ${fullName} to mail merge sheet`);
      alert(`✅ ${fullName} added to mail merge sheet.`);
    } else {
      throw new Error(data.error || 'Unknown server error');
    }
  } catch (err) {
    console.warn('Mail merge append failed:', err.message);
    alert(`⚠️ Could not reach server (${err.message})\nRow: ${fullName} | ${profileUrl} | ${jobIdInput.trim()}`);
  }
}

async function sendConnectionRequest() {
  const fullName = getProfilePersonName();
  const firstName = fullName && fullName !== 'Unknown Profile' ? fullName.split(/\s+/)[0] : '';
  if (!firstName) {
    alert('⚠️ Could not extract name from this profile.');
    return;
  }

  // Build message via prompts (mirrors bookmarklet logic)
  const msg = ['Hi ', firstName, ', '];
  const retry = prompt('Retry?');
  if (retry) {
    msg.push("hope my previous outreach didn't go to your Spam! ");
  } else {
    const event = prompt('For which event?');
    if (event) msg.push(`found you via ${event}; I couldn't make it. `);
  }
  if (prompt('Include looking?')) {
    msg.push("I'm hands-on ENG leader who's scaled SaaS and data-driven products and global teams of up to 50 over 13+ years. I'm seeking a new challenge, ideally in/near SF @ Series A/B. ");
  }
  const expertise = prompt('For what expertise?');
  if (expertise) msg.push(`Seems like you're a Go-To person on ${expertise}! `);
  const dow = new Date().getDay(); // 0=Sun,5=Fri,6=Sat
  if (dow === 5 || dow === 6 || dow === 0) msg.push('Have a great weekend! ');

  const outreach = msg.join('');
  const LOG = msg => console.debug('[CONNECTION REQUEST] ' + msg);
  LOG(`Message (${outreach.length} chars): ${outreach.slice(0, 60)}…`);

  // -- LinkedIn UI automation (mirrors components/networker/src/services/linkedin.ts) --

  // Skip if already pending
  const isPending = Array.from(document.querySelectorAll('button'))
    .some(b => (b.innerText || '').trim().toLowerCase() === 'pending');
  if (isPending) { LOG('Skipping — already pending'); alert('⚠️ Connection request already pending.'); return; }

  // Scope to main profile topcard — walk up from h1 to find the Topcard ancestor,
  // guaranteeing we target the profile being viewed rather than a sidebar card.
  const getTopCard = () => {
    const h1 = document.querySelector('h1');
    if (h1) {
      let node = h1.parentElement;
      while (node && node !== document.body) {
        const ck = node.getAttribute('componentkey') || '';
        if (ck.endsWith('Topcard') || ck.includes('Topcard')) return node;
        node = node.parentElement;
      }
    }
    return document.querySelector('[componentkey*="Topcard"]') || document;
  };
  const topCard = getTopCard();
  LOG(`Top card: ${topCard === document ? 'NOT FOUND (fallback to document)' : 'found, componentkey="...' + (topCard.getAttribute('componentkey') || '').slice(-30) + '"'}`);

  // Step 1: Direct Connect button scoped to top card
  const directConnect = Array.from(topCard.querySelectorAll('button, a')).find(b => {
    const label = (b.getAttribute('aria-label') || '').toLowerCase();
    const text = (b.innerText || '').toLowerCase().replace(/[^a-z ]/g, '').trim();
    return label.startsWith('invite ') || text === 'connect';
  });

  if (directConnect) {
    LOG(`Direct Connect button found: "${(directConnect.getAttribute('aria-label') || directConnect.innerText || '').trim()}" — clicking`);
    directConnect.click();
    await new Promise(r => setTimeout(r, 3000));
  } else {
    LOG('No direct Connect button — searching for More/··· button');

    // Step 2a: Find ··· More button scoped to top card — primary: stable SVG icon id
    let moreBtn = null;
    const overflowSvgs = topCard.querySelectorAll('svg[id="overflow-web-ios-small"]');
    LOG(`overflow-web-ios-small SVGs found: ${overflowSvgs.length}`);
    for (const svg of overflowSvgs) {
      const btn = svg.closest('button');
      if (btn) { moreBtn = btn; LOG('More button found via SVG id'); break; }
    }
    // Fallback: aria-label*="More actions" scoped to top card
    if (!moreBtn) {
      moreBtn = topCard.querySelector('button[aria-label*="More actions"]') ||
                Array.from(topCard.querySelectorAll('button')).find(b => {
                  const label = (b.getAttribute('aria-label') || '').trim().toLowerCase();
                  const text = (b.innerText || '').trim();
                  return label === 'more' || text === '...' || text === '…';
                }) || null;
      if (moreBtn) LOG(`More button found via fallback heuristic: aria-label="${moreBtn.getAttribute('aria-label') || ''}"`);
    }

    if (!moreBtn) {
      LOG('ERROR: Could not find More actions or Connect button');
      alert('⚠️ Could not find "More actions" or "Connect" button on this profile.');
      return;
    }

    moreBtn.click();
    LOG('More button clicked — waiting 2000ms for dropdown');
    await new Promise(r => setTimeout(r, 2000));

    // Step 2b: Find the Connect <a role="menuitem"> specifically — outer divs contain the same text
    // so a broad element search finds the wrong ancestor. Target the anchor directly.
    const conn = Array.from(document.querySelectorAll('a[role="menuitem"]')).find(el => {
      const text = (el.innerText || '').replace(/\s+/g, ' ').trim().toLowerCase();
      const label = (el.getAttribute('aria-label') || '').toLowerCase();
      const href = (el.getAttribute('href') || '').toLowerCase();
      return text === 'connect' || label.includes('invite') || href.includes('invite');
    });
    LOG(`Connect <a> found: ${conn ? `href="${conn.getAttribute('href')}"` : 'NOT FOUND'}`);

    if (!conn) {
      alert('⚠️ Could not find "Connect" in the overflow menu. Already connected?');
      return;
    }
    conn.click();
  }

  // Deep query: main document first, then known LinkedIn shadow hosts, then all shadow roots
  const deepQ = sel => {
    let el = document.querySelector(sel);
    if (el) return el;
    for (const id of ['interop-shadowdom', 'interop-outlet']) {
      const host = document.querySelector(`[data-testid="${id}"]`) || document.getElementById(id);
      if (host?.shadowRoot) { el = host.shadowRoot.querySelector(sel); if (el) return el; }
    }
    for (const host of document.querySelectorAll('*')) {
      if (host.shadowRoot) { el = host.shadowRoot.querySelector(sel); if (el) return el; }
    }
    return null;
  };
  // "Add a note" may vary in aria-label — also find by button text across all roots
  const findAddNote = () => {
    let btn = deepQ('button[aria-label="Add a note"]');
    if (btn) return btn;
    const roots = [document, ...Array.from(document.querySelectorAll('*')).filter(h => h.shadowRoot).map(h => h.shadowRoot)];
    for (const root of roots) {
      btn = Array.from(root.querySelectorAll('button')).find(b =>
        (b.innerText || b.textContent || '').trim().toLowerCase().includes('add a note')
      );
      if (btn) return btn;
    }
    return null;
  };

  // Step 3: Poll for "Add a note" button across all shadow roots (up to 10s)
  LOG('Polling for "Add a note" button (up to 10s)');
  let addNote = null;
  const addNoteDeadline = Date.now() + 10000;
  while (Date.now() < addNoteDeadline) {
    addNote = findAddNote();
    if (addNote) break;
    await new Promise(r => setTimeout(r, 200));
  }

  if (addNote) {
    LOG('"Add a note" button found — clicking');
    addNote.click();
    LOG('Polling for textarea (up to 5s)');
    const taWaitDeadline = Date.now() + 5000;
    while (Date.now() < taWaitDeadline) {
      if (deepQ('textarea')) break;
      await new Promise(r => setTimeout(r, 200));
    }
  } else {
    LOG('"Add a note" not found after 10s — attempting to fill textarea directly');
  }

  // Step 4: Fill textarea via native setter (triggers React synthetic events)
  const ta = deepQ('textarea');
  LOG(`textarea: ${ta ? `FOUND (id="${ta.id || 'none'}")` : 'NOT FOUND'}`);
  if (ta) {
    const nativeSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
    nativeSetter.call(ta, outreach);
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    ta.dispatchEvent(new Event('change', { bubbles: true }));
    LOG('Textarea filled successfully');
  } else {
    LOG('ERROR: no textarea found in any shadow root or main document');
    alert(`Message built (${outreach.length} chars) but could not auto-insert. Check console.`);
  }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'extractLinkedInConnections') {
    runLinkedInConnectionExtraction();
    sendResponse({ success: true });
    return true;
  }

  if (request.action === 'addToMailMerge') {
    addToMailMerge();
    sendResponse({ success: true });
    return true;
  }

  if (request.action === 'sendConnectionRequest') {
    sendConnectionRequest();
    sendResponse({ success: true });
    return true;
  }

  if (request.action === 'extractMutualConnections') {
    // Profile page → find mutual connections link and click it (navigates to search page)
    // Search page → extract data from current results
    var url = window.location.href;
    if (url.includes('/search/results/') && (url.includes('connectionOf') || url.includes('facetConnectionOf'))) {
      extractMutualConnectionNames();
    } else {
      findAndClickMutualConnections();
    }
    sendResponse({ success: true });
    return true;
  }
});

// ===== Initialization =====

// Run check when page loads - handle multiple scenarios
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    checkForLinkedInExtraction();
    checkForLinkedInProfile();
    checkForLinkedInFeed();
  });
} else {
  // Page is already loaded, run checks immediately
  checkForLinkedInExtraction();
  checkForLinkedInProfile();
  checkForLinkedInFeed();
}

// Also listen for window load event as fallback
window.addEventListener('load', () => {
  checkForLinkedInExtraction();
  checkForLinkedInProfile();
  checkForLinkedInFeed();
});

// Listen for navigation via History API (for SPA-style navigation)
window.addEventListener('popstate', () => {
  log('Navigation detected via popstate event');
  setTimeout(() => {
    checkForLinkedInExtraction();
    checkForLinkedInProfile();
    checkForLinkedInFeed();
  }, 500);
});

// Monitor URL changes for SPA navigation
let currentUrl = window.location.href;
function checkUrlChange() {
  if (window.location.href !== currentUrl) {
    const newUrl = window.location.href;
    log('URL changed from', currentUrl, 'to', newUrl);
    currentUrl = newUrl;

    // Reset processed search page when navigating away from search results
    if (!newUrl.includes('/search/results/')) {
      if (processedSearchPageUrl !== null) {
        log('Navigated away from search results - resetting processed URL flag');
        processedSearchPageUrl = null;
      }
    }

    // If we're awaiting mutual connections extraction and just landed on the search page, run immediately
    const awaitingExtraction = localStorage.getItem('linkedin_awaiting_mutual_connections');
    const isMutualConnectionsPage = newUrl.includes('/search/results/') && (newUrl.includes('connectionOf') || newUrl.includes('facetConnectionOf'));

    if (awaitingExtraction === 'true' && isMutualConnectionsPage) {
      log('Detected navigation to mutual connections page - triggering checks immediately');
      // Run checks immediately without the usual delay
      setTimeout(() => {
        checkForLinkedInExtraction();
        checkForLinkedInProfile();
        checkForLinkedInFeed();
      }, 500); // Reduced delay from 1000ms to 500ms
    } else {
      // Normal delay for other navigation
      setTimeout(() => {
        checkForLinkedInExtraction();
        checkForLinkedInProfile();
        checkForLinkedInFeed();
      }, 1000);
    }
  }
}
setInterval(checkUrlChange, 1000);

log('LinkedIn Networking: Content script loaded');
log('💡 LinkedIn Feed: Post save monitoring available when enabled');
