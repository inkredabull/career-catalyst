// LinkedIn Networking Component - Content Script
// Handles LinkedIn connection extraction, mutual connections, and feed post saves

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
  searchDoc: null   // cached once on first page, reused for all subsequent pages
};

// Settings
let linkedInNetworkingEnabled = false; // Disabled by default, requires opt-in

// Load settings from storage
chrome.storage.sync.get(['linkedInNetworkingEnabled'], (result) => {
  linkedInNetworkingEnabled = result.linkedInNetworkingEnabled || false;
  console.log(`LinkedIn Networking: ${linkedInNetworkingEnabled ? 'ENABLED' : 'DISABLED'}`);
});

// Listen for settings changes
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'sync' && changes.linkedInNetworkingEnabled) {
    linkedInNetworkingEnabled = changes.linkedInNetworkingEnabled.newValue;
    console.log(`LinkedIn Networking: ${linkedInNetworkingEnabled ? 'ENABLED' : 'DISABLED'}`);
  }
});

// ===== LinkedIn Company People Page Extraction =====

function detectLinkedInCompanyPeople() {
  const url = window.location.href;
  return url.includes('linkedin.com/company/') && url.includes('/people/');
}

function runLinkedInConnectionExtraction() {
  if (!linkedInNetworkingEnabled) {
    console.log('LinkedIn Networking: Feature disabled in settings');
    return;
  }

  console.log("LinkedIn Connection Extractor - Starting profile clicks...");

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
    console.log(`Trying selector "${pattern}": found ${foundElements.length} elements`);

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

        console.log(`Found unique connection: ${name} - ${headline}`);
        clickableElements.push({
            element: profileLink,
            name: name,
            headline: headline
        });
      }
      break; // Stop trying other patterns if we found some elements
    }
  }

  console.log(`Found ${clickableElements.length} connection profiles.`);

  if (clickableElements.length > 0) {
    console.log(`LinkedIn networking: Found ${clickableElements.length} profiles. Use context menu to extract.`);
    linkedInExtractionRunning = false;
  } else {
    console.log("No clickable connection profiles found with any selector pattern.");
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
      console.log('LinkedIn company people page detected - waiting 5 seconds before extraction...');
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
    // Try multiple selectors for the profile name
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
    console.log('Error getting profile person name:', error);
    return 'Unknown Profile';
  }
}

function findAndClickMutualConnections() {
  if (!linkedInNetworkingEnabled) {
    console.log('LinkedIn Networking: Mutual connections feature disabled in settings');
    return;
  }

  console.log('Looking for mutual connections link...');

  // Don't run on search results pages
  if (window.location.href.includes('/search/results/')) {
    console.log('Skipping mutual connections search - already on search results page');
    return;
  }

  // Get the current profile person's name from the page
  var profileName = getProfilePersonName();
  console.log(`Profile person name: "${profileName}"`);

  // Look specifically for the main mutual connections link, not individual connection links
  var mutualConnectionLink = null;

  // Find elements that contain mutual connections text - be more specific
  var textElements = document.querySelectorAll('span.t-normal, span.hoverable-link-text');
  for (let textElement of textElements) {
    var text = textElement.innerText || textElement.textContent || '';
    // Look for text that says "X other mutual connections" or "and X other mutual connections"
    if (text.includes('mutual connection') && text.includes('other')) {
      // Found text like "Dawn Ho, Robert Monarch, and 5 other mutual connections"
      var linkElement = textElement.closest('a');
      if (linkElement) {
        var linkText = linkElement.innerText;
        if (linkText.includes('other mutual connection')) {
          mutualConnectionLink = linkElement;
          console.log(`Found mutual connections link with full text: "${linkText.trim()}"`);
          break;
        }
      }
    }
  }

  // Alternative approach: find all links and look for mutual connections text
  if (!mutualConnectionLink) {
    var allLinks = document.querySelectorAll('a');
    for (let link of allLinks) {
      var linkText = link.innerText || link.textContent || '';
      // Make sure it contains the full mutual connections text and not just a name
      if (linkText.includes('mutual connection') && linkText.includes('other') && !link.href.includes('/in/')) {
        mutualConnectionLink = link;
        console.log(`Selected mutual connections link: "${linkText.trim()}"`);
        break;
      }
    }
  }

  if (mutualConnectionLink) {
    console.log('Found mutual connections link, clicking...');
    console.log(`Link URL: ${mutualConnectionLink.href}`);

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

    // Store in localStorage for mutual connections extraction
    localStorage.setItem('linkedin_target_profile_url', currentUrl);
    localStorage.setItem('linkedin_target_profile_name', nameToStore);
    localStorage.setItem('linkedin_extraction_timestamp', Date.now().toString());
    // Set flag to indicate we're expecting a mutual connections page load
    localStorage.setItem('linkedin_awaiting_mutual_connections', 'true');

    console.log(`Stored profile info - name: "${nameToStore}", URL: "${currentUrl}"`);

    mutualConnectionLink.click();
  } else {
    console.log('No mutual connections link found on this profile');
  }
}

async function extractMutualConnectionNames() {
  if (!linkedInNetworkingEnabled) {
    console.log('LinkedIn Networking: Mutual connections extraction disabled in settings');
    return;
  }

  console.log('Extracting mutual connection names...');

  try {
    // Get the target profile URL from localStorage
    var targetProfileUrl = localStorage.getItem('linkedin_target_profile_url') || '';
    console.log(`Target profile URL: "${targetProfileUrl}"`);

    // Extract first name directly from the URL
    var targetFirstName = 'Unknown';
    if (targetProfileUrl) {
      var urlMatch = targetProfileUrl.match(/linkedin\.com\/in\/([^\/\?]+)/);
      if (urlMatch) {
        var urlSlug = urlMatch[1];
        // Convert URL slug to first name: "samuel-bigio-42918b128" -> "Samuel"
        var firstName = urlSlug
          .split('-')[0]
          .replace(/\d+/g, '')
          .trim();

        if (firstName.length > 0) {
          targetFirstName = firstName.charAt(0).toUpperCase() + firstName.slice(1).toLowerCase();
        }
      }
    }

    console.log(`Extracted first name from URL: "${targetFirstName}"`);

    // Initialize pagination state on first extraction
    if (!paginationState.isExtracting) {
      paginationState.isExtracting = true;
      paginationState.allResults = [];
      paginationState.seenNames = new Set();
      paginationState.currentPage = 1;
      paginationState.targetProfileUrl = targetProfileUrl;
      paginationState.targetFirstName = targetFirstName;
      paginationState.searchDoc = null;
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
              console.log('Found results in interop-iframe');
              return iDoc;
            }
          } catch(e) { /* cross-origin guard, shouldn't happen for linkedin.com */ }
        }
        // Fallback: top-level document (for non-iframe renders)
        if (document.querySelector(RESULT_SELECTOR)) {
          console.log('Found results in top-level document');
          return document;
        }
        await new Promise(function(r) { setTimeout(r, 300); });
      }
      // Timeout — return whatever we have
      var iframe = document.querySelector('iframe[data-testid="interop-iframe"]');
      if (iframe) {
        try {
          var iDoc = iframe.contentDocument || (iframe.contentWindow && iframe.contentWindow.document);
          if (iDoc) { console.log('Timeout — using interop-iframe document anyway'); return iDoc; }
        } catch(e) {}
      }
      console.log('Timeout — falling back to top-level document');
      return document;
    }

    var searchDoc;
    if (paginationState.searchDoc) {
      searchDoc = paginationState.searchDoc;
      console.log('Using cached searchDoc');
    } else {
      console.log('Waiting for search results (up to 10s, checks top-level + interop-iframe)...');
      searchDoc = await findSearchDocument(10000);
      console.log(`searchDoc resolved: ${searchDoc === document ? 'top-level document' : 'iframe document'}`);
      paginationState.searchDoc = searchDoc;
    }

    // Extract connections from current page
    var nameElements = [];

    // Primary: target each result item by stable data attribute, extract name from the
    // name link's span[dir="ltr"] > span[aria-hidden="true"] (observed in 2026 DOM)
    var resultItems = Array.from(searchDoc.querySelectorAll(RESULT_SELECTOR));
    console.log(`Found ${resultItems.length} result items via data attribute`);

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
          nameElements.push({ innerText: text });
          break; // one name per result item
        }
      });
      if (nameElements.length > 0) {
        console.log(`✓ Extracted ${nameElements.length} names via data-attribute item approach`);
      }
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
        console.log(`Trying selector "${selector}": found ${elements.length} elements`);
        if (elements.length > 0) {
          var candidates = elements.map(function(el) {
            return { innerText: (el.textContent || el.innerText || '').replace(/<!---->/g, '').trim() };
          }).filter(function(el) { return el.innerText.length > 0; });
          if (candidates.length > 0) {
            nameElements = candidates;
            console.log(`✓ Using legacy selector: ${selector} (${nameElements.length} matches)`);
            break;
          }
        }
      }
    }

    if (nameElements.length === 0) {
      console.log('Could not find mutual connections with any known selector');
      outputAccumulatedResults();
      return;
    }

    // Add current page results to accumulated results (deduplicated)
    if (!paginationState.seenNames) paginationState.seenNames = new Set();
    console.log(`Page ${paginationState.currentPage}: Found ${nameElements.length} connections`);
    nameElements.forEach((element) => {
      var mutualConnectionName = element.innerText.trim();
      if (mutualConnectionName && mutualConnectionName.length > 0 && !paginationState.seenNames.has(mutualConnectionName)) {
        paginationState.seenNames.add(mutualConnectionName);
        paginationState.allResults.push(mutualConnectionName);
      }
    });

    // Check if there's a next page button
    console.log('Checking for next page button...');
    var nextPageButton = await findNextPageButton(searchDoc);
    console.log('findNextPageButton resolved:', nextPageButton ? 'found' : 'null');

    if (nextPageButton) {
      console.log(`Navigating to page ${paginationState.currentPage + 1}...`);
      paginationState.currentPage++;

      // Fingerprint the first result so we can detect when the page has actually changed
      var firstItem = searchDoc.querySelector(RESULT_SELECTOR);
      var fingerprint = firstItem ? (firstItem.getAttribute('data-chameleon-result-urn') || firstItem.textContent.trim().slice(0, 60)) : null;
      console.log('Page fingerprint before click:', fingerprint ? fingerprint.slice(0, 40) : 'none');

      nextPageButton.click();

      // Wait until the content changes (new page loaded), up to 8s
      await new Promise(r => setTimeout(r, 200));
      var changeDeadline = Date.now() + 8000;
      while (Date.now() < changeDeadline) {
        var newFirst = searchDoc.querySelector(RESULT_SELECTOR);
        var newFingerprint = newFirst ? (newFirst.getAttribute('data-chameleon-result-urn') || newFirst.textContent.trim().slice(0, 60)) : null;
        if (newFingerprint !== fingerprint) {
          console.log('Content changed — new page detected');
          break;
        }
        await new Promise(r => setTimeout(r, 300));
      }

      extractMutualConnectionNames();
    } else {
      // No more pages, output all accumulated results
      console.log('No more pages found. Outputting all results...');
      outputAccumulatedResults();
    }

  } catch (error) {
    console.error('Error extracting mutual connection names:', error);
    outputAccumulatedResults();
  }
}

async function findNextPageButton(searchDoc) {
  var nextPageNum = paginationState.currentPage + 1;
  // Results are in the iframe; pagination controls are in the top-level document.
  // Check both, top-level first.
  var docsToSearch = [document];
  if (searchDoc && searchDoc !== document) docsToSearch.push(searchDoc);

  console.log('findNextPageButton: looking for page', nextPageNum);

  var deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    for (var d of docsToSearch) {
      var li = d.querySelector(`[data-test-pagination-page-btn="${nextPageNum}"]`);
      if (li) {
        var btn = li.querySelector('button');
        if (btn && !btn.disabled) {
          console.log(`Found page ${nextPageNum} button in ${d === document ? 'top-level' : 'iframe'} doc`);
          return btn;
        }
      }
      var numbered = d.querySelector(`button[aria-label="Page ${nextPageNum}"]`);
      if (numbered && !numbered.disabled) {
        console.log(`Found page ${nextPageNum} button (aria-label) in ${d === document ? 'top-level' : 'iframe'} doc`);
        return numbered;
      }
    }
    await new Promise(r => setTimeout(r, 300));
  }

  // Diagnostic: show what pagination is visible in each doc
  docsToSearch.forEach(function(d) {
    var btns = d.querySelectorAll('[data-test-pagination-page-btn]');
    console.log(`${d === document ? 'top-level' : 'iframe'} pagination li count: ${btns.length}`,
      Array.from(btns).map(el => el.getAttribute('data-test-pagination-page-btn')));
  });
  return null;
}

function outputAccumulatedResults() {
  if (paginationState.allResults.length === 0) {
    console.log('No results to output');
    paginationState.isExtracting = false;
    return;
  }

  // Build CSV output
  var result = 'Full,PersonName,PersonURL\n'; // CSV headers

  paginationState.allResults.forEach((mutualConnectionName) => {
    var csvRow = `"${mutualConnectionName}","${paginationState.targetFirstName}","${paginationState.targetProfileUrl}"`;
    result += csvRow + '\n';
  });

  console.log('='.repeat(80));
  console.log(`COMPLETE CSV OUTPUT (${paginationState.currentPage} pages, ${paginationState.allResults.length} total connections):`);
  console.log('='.repeat(80));
  console.log(result);
  console.log('='.repeat(80));
  console.log(`✅ Extraction complete! Total mutual connections found: ${paginationState.allResults.length}`);
  console.log('='.repeat(80));

  // Copy CSV to clipboard using fallback method (works reliably in content scripts)
  console.log('🔄 Attempting to copy CSV to clipboard...');
  const copyToClipboard = (text) => {
    console.log('📋 copyToClipboard function called, text length:', text.length);

    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.left = '-999999px';
    textarea.style.top = '-999999px';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();

    console.log('📋 Textarea created and text selected');

    try {
      const successful = document.execCommand('copy');
      console.log('📋 execCommand result:', successful);
      document.body.removeChild(textarea);

      if (successful) {
        console.log('✅ CSV automatically copied to clipboard!');
        alert(
          `✅ Mutual Connections Extracted!\n\n` +
          `Found ${paginationState.allResults.length} mutual connections across ${paginationState.currentPage} page(s).\n\n` +
          `CSV data has been automatically copied to your clipboard.\n\n` +
          `You can now paste it directly into your spreadsheet.`
        );
        return true;
      } else {
        console.error('❌ execCommand returned false');
        throw new Error('execCommand copy failed');
      }
    } catch (err) {
      console.error('❌ Failed to copy to clipboard:', err);
      document.body.removeChild(textarea);
      alert(
        `✅ Extraction Complete!\n\n` +
        `Found ${paginationState.allResults.length} mutual connections.\n\n` +
        `⚠️ Could not auto-copy to clipboard.\n` +
        `Please manually copy the CSV output from the browser console.`
      );
      return false;
    }
  };

  // Execute the copy
  console.log('🚀 Calling copyToClipboard with result...');
  copyToClipboard(result);

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

// Auto-detect LinkedIn profile pages and find mutual connections
function checkForLinkedInProfile() {
  if (!linkedInNetworkingEnabled) {
    return; // Skip if disabled
  }

  // Only run on individual profile pages, NOT on company people pages or search results pages
  var url = window.location.href;
  var isProfilePage = url.includes('linkedin.com/in/');
  var isCompanyPage = detectLinkedInCompanyPeople();
  var isSearchPage = url.includes('/search/results/');

  console.log(`checkForLinkedInProfile: isProfilePage=${isProfilePage}, isCompanyPage=${isCompanyPage}, isSearchPage=${isSearchPage}`);

  if (isProfilePage && !isCompanyPage && !isSearchPage) {
    // Extract profile URL for the confirmation dialog
    const profileUrl = url;
    const profileName = getProfilePersonName();

    // Check if we've already prompted for this profile in this session
    if (promptedProfiles.has(profileUrl)) {
      console.log('Already prompted for this profile in this session, skipping...');
      return;
    }

    console.log('LinkedIn profile page detected - waiting 3 seconds before showing confirmation...');
    processedSearchPageUrl = null; // Reset for new profile

    setTimeout(() => {
      // Mark this profile as prompted to avoid duplicate dialogs
      promptedProfiles.add(profileUrl);
      showExtractionPrompt(profileName, () => {
        console.log('User confirmed - proceeding with mutual connections extraction');
        findAndClickMutualConnections();
      }, () => {
        console.log('User cancelled mutual connections extraction');
      });
    }, 3000);
  } else if (isSearchPage) {
    // Check if we're awaiting mutual connections extraction
    const awaitingExtraction = localStorage.getItem('linkedin_awaiting_mutual_connections');

    console.log('🔍 DEBUG: On search page');
    console.log('🔍 DEBUG: URL:', url);
    console.log('🔍 DEBUG: Awaiting extraction flag:', awaitingExtraction);
    console.log('🔍 DEBUG: Already processed URL:', processedSearchPageUrl);

    if (awaitingExtraction === 'true') {
      // Check if we've already processed this exact search URL
      if (processedSearchPageUrl === url) {
        console.log('Already processed this search page URL, skipping...');
        return;
      }

      console.log('LinkedIn mutual connections search page detected - auto-triggering extraction...');
      console.log('Auto-triggered extraction detected - clearing flag and proceeding...');
      localStorage.removeItem('linkedin_awaiting_mutual_connections');

      // Mark this URL as processed
      processedSearchPageUrl = url;

      // Kick off extraction — MutationObserver inside will wait for results
      console.log('Triggering extraction (MutationObserver will wait for results)...');
      setTimeout(() => {
        extractMutualConnectionNames();
      }, 500);
    } else {
      console.log('No awaiting extraction flag found - user may have navigated here manually');
    }
  }
}

// ===== LinkedIn Feed Post Save Detection =====

function detectLinkedInFeed() {
  const url = window.location.href;
  const isLinkedInFeed = url.includes('linkedin.com/feed');
  console.log('LinkedIn Feed: URL check:', { url, isLinkedInFeed });
  return isLinkedInFeed;
}

function initLinkedInFeedMonitoring() {
  if (!linkedInNetworkingEnabled) {
    console.log('LinkedIn Feed: Monitoring disabled in settings');
    return;
  }

  if (!detectLinkedInFeed()) {
    console.log('LinkedIn Feed: Not on feed page, skipping monitoring');
    return;
  }

  console.log('LinkedIn Feed: ✅ Monitoring for post saves activated!');

  // Monitor network requests for LinkedIn save API calls
  setupLinkedInNetworkMonitoring();
}

function setupLinkedInNetworkMonitoring() {
  console.log('LinkedIn Feed: Setting up postMessage listener for injected script...');

  // Listen for messages from the injected script
  window.addEventListener('message', function(event) {
    // Only accept messages from the same origin
    if (event.origin !== window.location.origin) {
      return;
    }

    // Check if this is a LinkedIn post save message
    if (event.data && event.data.type === 'LINKEDIN_POST_SAVED') {
      console.log('LinkedIn Feed: 🎯 Received post save message from injected script!', event.data);

      const { activityUrn, url, timestamp } = event.data;
      if (activityUrn) {
        console.log('LinkedIn Feed: Processing saved post with activity URN:', activityUrn);

        // Small delay to let the UI update, then find and process the post
        setTimeout(() => {
          findAndProcessSavedPost(activityUrn);
        }, 1000);
      }
    }
  });

  console.log('LinkedIn Feed: ✅ PostMessage listener set up successfully');
}

function findAndProcessSavedPost(activityUrn) {
  try {
    console.log('LinkedIn Feed: Looking for post with activity URN:', activityUrn);

    // Find the post element by looking for elements with the activity URN
    const postElement = findPostByActivityUrn(activityUrn);

    if (postElement) {
      console.log('LinkedIn Feed: Found post element for saved post!');
      extractAndCreateReminderFromPost(postElement);
    } else {
      console.log('LinkedIn Feed: Could not find post element for activity URN:', activityUrn);
    }
  } catch (error) {
    console.error('LinkedIn Feed: Error processing saved post:', error);
  }
}

function findPostByActivityUrn(activityUrn) {
  // Try to find post by data-urn attribute
  const postElement = document.querySelector(`[data-urn*="${activityUrn}"]`);
  if (postElement) {
    console.log('LinkedIn Feed: Found post by data-urn attribute');
    return postElement;
  }

  return null;
}

function extractAndCreateReminderFromPost(postElement) {
  try {
    console.log('LinkedIn Feed: Extracting post information...');

    const postInfo = extractLinkedInPostInfo(postElement);

    if (postInfo && postInfo.author) {
      console.log('LinkedIn Feed: Creating reminder for saved post...', postInfo);

      chrome.runtime.sendMessage({
        action: 'createLinkedInPostReminder',
        postInfo: postInfo
      }, response => {
        if (response && response.success) {
          console.log('LinkedIn Feed: ✅ Reminder created successfully!');
          showLinkedInFeedNotification('📌 Reminder created for saved post');
        } else {
          console.log('LinkedIn Feed: ❌ Failed to create reminder:', response?.error);
        }
      });
    } else {
      console.log('LinkedIn Feed: ⚠️ Could not extract enough post information');
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

    console.log('LinkedIn Feed: Extracted post info:', postInfo);
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
  console.log('LinkedIn Feed: checkForLinkedInFeed() called');
  if (detectLinkedInFeed()) {
    console.log('LinkedIn Feed: Detected LinkedIn feed page, initializing monitoring...');
    initLinkedInFeedMonitoring();
  } else {
    console.log('LinkedIn Feed: Not on LinkedIn feed page, skipping...');
  }
}

// ===== Message Handlers =====

// Listen for messages from background script (context menu actions)
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'extractLinkedInConnections') {
    runLinkedInConnectionExtraction();
    sendResponse({ success: true });
    return true;
  }

  if (request.action === 'extractMutualConnections') {
    extractMutualConnectionNames();
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
  console.log('Navigation detected via popstate event');
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
    console.log('URL changed from', currentUrl, 'to', newUrl);
    currentUrl = newUrl;

    // Reset processed search page when navigating away from search results
    if (!newUrl.includes('/search/results/')) {
      if (processedSearchPageUrl !== null) {
        console.log('Navigated away from search results - resetting processed URL flag');
        processedSearchPageUrl = null;
      }
    }

    // If we're awaiting mutual connections extraction and just landed on the search page, run immediately
    const awaitingExtraction = localStorage.getItem('linkedin_awaiting_mutual_connections');
    const isMutualConnectionsPage = newUrl.includes('/search/results/') && (newUrl.includes('connectionOf') || newUrl.includes('facetConnectionOf'));

    if (awaitingExtraction === 'true' && isMutualConnectionsPage) {
      console.log('Detected navigation to mutual connections page - triggering checks immediately');
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

console.log('LinkedIn Networking: Content script loaded');
console.log('💡 LinkedIn Feed: Post save monitoring available when enabled');
