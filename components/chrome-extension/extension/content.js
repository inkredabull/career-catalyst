// Career Catalyst Assistant - Content Script
// VERSION: 2026-01-21-19:30 - Debug scoring report check
console.log('Content script loaded - VERSION: 2026-01-21-19:30');
let gutterElement = null;
let isGutterOpen = false;
let extractedJobDescription = '';

// Global toggle for Career Catalyst Assistant
let jobExtractorEnabled = true;

// Debounce utility function
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// Reset extraction mode to local (free) on page load
// Always default to local mode to avoid unexpected token usage
function resetExtractionModeToLocal() {
  const extractionModeSelect = document.getElementById('extraction-mode');
  if (extractionModeSelect) {
    extractionModeSelect.value = 'local';
    console.log('Career Catalyst: Extraction mode reset to local (default)');
  }
}

// Expose global toggle function to browser console immediately
window.toggleJobExtractor = function(enabled) {
  if (typeof enabled === 'boolean') {
    jobExtractorEnabled = enabled;
    console.log(`Career Catalyst Assistant ${enabled ? 'ENABLED' : 'DISABLED'}`);
    
    if (!enabled && gutterElement) {
      closeGutter();
    }
  } else {
    // Toggle current state if no parameter provided
    jobExtractorEnabled = !jobExtractorEnabled;
    console.log(`Career Catalyst Assistant ${jobExtractorEnabled ? 'ENABLED' : 'DISABLED'}`);
    
    if (!jobExtractorEnabled && gutterElement) {
      closeGutter();
    }
  }
  
  return jobExtractorEnabled;
};

// Expose status check function
window.getJobExtractorStatus = function() {
  console.log(`Career Catalyst Assistant is currently ${jobExtractorEnabled ? 'ENABLED' : 'DISABLED'}`);
  return jobExtractorEnabled;
};

// Expose manual LinkedIn feed monitoring function
window.initLinkedInFeedMonitoring = globalThis.initLinkedInFeedMonitoring = function() {
  console.log('Manually initializing LinkedIn feed monitoring...');
  setupLinkedInNetworkMonitoring();
  return 'LinkedIn feed monitoring activated!';
};

// Expose manual mutual connections extraction function
window.extractCurrentPage = globalThis.extractCurrentPage = function() {
  console.log('Extracting mutual connections from current page...');
  
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
        // Convert URL slug to first name: "seldo" -> "Seldo"
        var firstName = urlSlug
          .split('-')[0]                    // Get first part before hyphens
          .replace(/\d+/g, '')             // Remove any numbers
          .trim();
        
        if (firstName.length > 0) {
          targetFirstName = firstName.charAt(0).toUpperCase() + firstName.slice(1).toLowerCase();
        }
      }
    }
    
    console.log(`Extracted first name from URL: "${targetFirstName}"`);
    
    // Extract mutual connections using the same logic as the automatic function
    var identifier = document.querySelectorAll('div.mb1 a')[0]?.className.trim();
    if (!identifier) {
      console.log('Could not find identifier for mutual connections on this page');
      return;
    }
    
    var result = 'Full,PersonName,PersonURL\n'; // CSV headers
    var selector = '.t-16 a.' + identifier + '>span>span:not(.visually-hidden)';
    var nameElements = document.querySelectorAll(selector);
    
    nameElements.forEach((element) => {
      var mutualConnectionName = element.innerText.trim();
      if (mutualConnectionName) {
        // Output format: mutual connection full name, target profile first name, target profile URL
        var csvRow = `"${mutualConnectionName}","${targetFirstName}","${targetProfileUrl}"`;
        result += csvRow + '\n';
      }
    });
    
    if (nameElements.length > 0) {
      console.log('Complete CSV output:');
      console.log(result);
      return result;
    } else {
      console.log('No mutual connection names found on current page');
      return null;
    }
    
  } catch (error) {
    console.error('Error extracting mutual connections from current page:', error);
    return null;
  }
};

// Create the right gutter
function createGutter() {
  if (gutterElement) return;
  
  gutterElement = document.createElement('div');
  gutterElement.id = 'job-extractor-gutter';
  gutterElement.innerHTML = `
    <div class="gutter-header">
      <div class="header-top">
        <h3>🎯 Career Catalyst Assistant</h3>
        <button id="close-gutter">×</button>
      </div>
      <div class="header-job-id">
        <label for="job-id">🆔 Job ID:</label>
        <input type="text" id="job-id" class="job-id-input" placeholder="e.g., b3358ff6"
               title="Unique identifier for this job - auto-generated when tracking or paste existing ID">
      </div>
    </div>
    <div class="gutter-content">
      <!-- People I Know Section -->
      <div class="section people-section">
        <h4 class="section-header">
          👥 People I Know at This Company
          <span id="connections-status-icon" class="status-icon" title="Enter company name to search connections">⚪</span>
        </h4>
        <p class="section-description">Find connections at this company on LinkedIn</p>

        <button id="search-connections" class="action-btn connections-btn" disabled>
          🔍 Search LinkedIn Connections
        </button>
      </div>
      <!-- AI Assistant Section -->
      <div class="section ai-assistant-section">
        <h4 class="section-header">🤖 AI Assistant</h4>
        <p class="section-description">Ask interview questions or generate custom blurbs</p>

        <div class="input-section">
          <input type="text" id="llm-input" placeholder="Enter your question here...">
          <button id="submit-query" class="submit-btn">Submit</button>
        </div>

        <div class="form-field">
          <label for="company-website">Company Website (optional):</label>
          <input type="text" id="company-website" class="job-input" placeholder="e.g., https://company.com" title="Used to research company values for blurb generation">
        </div>

        <!-- Third Person Blurb Section -->
        <div class="blurb-section">
          <h5 class="blurb-section-title">Third Person Perspective</h5>
          <div id="third-person-blurb-container">
            <div id="third-person-blurb-status" class="blurb-status">
              <span id="third-person-blurb-status-text">Track a job to check for blurb</span>
            </div>
            <div id="third-person-blurb-display" style="display: none;">
              <div id="third-person-blurb-content" class="blurb-content"></div>
              <button id="copy-third-person-blurb" class="copy-blurb-btn">📋 Copy to Clipboard</button>
            </div>
            <button id="generate-third-person-blurb" class="action-btn blurb-btn" style="display: none;">
              📝 Generate Third Person Blurb
            </button>
          </div>
        </div>

        <!-- First Person Blurb Section -->
        <div class="blurb-section">
          <h5 class="blurb-section-title">First Person Perspective</h5>
          <div id="first-person-blurb-container">
            <div id="first-person-blurb-status" class="blurb-status">
              <span id="first-person-blurb-status-text">Track a job to check for blurb</span>
            </div>
            <div id="first-person-blurb-display" style="display: none;">
              <div id="first-person-blurb-content" class="blurb-content"></div>
              <button id="copy-first-person-blurb" class="copy-blurb-btn">📋 Copy to Clipboard</button>
            </div>
            <button id="generate-first-person-blurb" class="action-btn blurb-btn" style="display: none;">
              📝 Generate First Person Blurb
            </button>
          </div>
        </div>

        <div id="llm-response" class="response-section" style="display: none;">
          <div class="response-header">
            <span class="status-indicator success">✓</span>
            <strong>AI Response:</strong>
          </div>
          <div class="response-content"></div>
        </div>

        <div id="page-questions" class="page-analysis" style="display: none;">
          <h5>Questions Found on Page:</h5>
          <ul id="questions-list"></ul>
        </div>
      </div>

      <!-- Job Information Section -->
      <div class="section job-info-section">
        <h4 class="section-header">📄 Job Information</h4>
        <p class="section-description">Auto-extracted job details (editable)</p>

        <div class="form-field">
          <label for="extraction-mode">Extraction Mode:</label>
          <select id="extraction-mode" class="extraction-mode-select">
            <option value="local" selected>⚡ Fast (Local RegEx) - Free</option>
            <option value="server">🎯 Accurate (LLM) - Uses API tokens</option>
          </select>
          <p class="help-text">Local mode is instant and free. Server mode is more accurate but uses LLM API tokens.</p>
        </div>

        <div class="form-field">
          <label for="job-title">Job Title:</label>
          <input type="text" id="job-title" class="job-input" placeholder="Job title will be extracted automatically...">
        </div>

        <div class="form-field">
          <label for="company-name">Company:</label>
          <input type="text" id="company-name" class="job-input" placeholder="Company name will be extracted automatically...">
        </div>

        <div class="form-field">
          <label for="job-location">Location:</label>
          <input type="text" id="job-location" class="job-input" placeholder="Job location will be extracted automatically...">
        </div>

        <div class="form-field salary-range">
          <label>Salary Range:</label>
          <div class="salary-inputs">
            <input type="text" id="min-salary" class="job-input salary-input" placeholder="Min (e.g., 120000)">
            <span class="salary-separator">to</span>
            <input type="text" id="max-salary" class="job-input salary-input" placeholder="Max (e.g., 160000)">
          </div>
        </div>

        <div class="form-field">
          <label for="job-url">Job URL:</label>
          <input type="text" id="job-url" class="job-input" placeholder="Current page URL">
        </div>

        <div class="form-field">
          <label for="job-description">Description:</label>
          <textarea id="job-description" class="job-description-textarea" placeholder="Job description will be extracted automatically..."></textarea>
        </div>

        <div class="form-field">
          <label for="reports-to">Reports to:</label>
          <input type="text" id="reports-to" class="job-input" placeholder="Will be extracted from job description..." disabled>
        </div>

        <div class="form-field">
          <label for="company-stage">Stage of the Company:</label>
          <input type="text" id="company-stage" class="job-input" placeholder="Will be looked up from company data..." disabled>
        </div>

        <div class="form-field">
          <label for="resume-url">Resume:</label>
          <div id="resume-container">
            <div id="resume-status" class="resume-status">
              <span id="resume-status-text">Track a job to check for resume</span>
            </div>
            <div id="resume-url-display" style="display: none;">
              <a id="resume-link" href="#" target="_blank" class="resume-link">📄 View Local Resume (Markdown)</a>
            </div>
            <div id="resume-drive-section" style="display: none; margin-top: 10px;">
              <input type="text" id="resume-drive-url" class="job-input" placeholder="Paste Google Drive PDF link here..." style="margin-bottom: 8px;">
              <button id="save-resume-drive-url" class="save-drive-url-btn">💾 Save Google Drive Link</button>
            </div>
            <div id="resume-drive-display" style="display: none; margin-top: 10px;">
              <a id="resume-drive-link" href="#" target="_blank" class="resume-drive-link">📄 View Resume PDF (Google Drive)</a>
              <button id="edit-resume-drive-url" class="edit-drive-url-btn">✏️ Edit Link</button>
            </div>
            <button id="generate-resume-btn" class="generate-resume-btn" style="display: none;">
              Generate Tailored Resume
            </button>
          </div>
        </div>

        <!-- TEAL INTEGRATION COMMENTED OUT - Don't remove, just disabled
        <div class="form-field">
          <label class="radio-label">
            <input type="checkbox" id="track-in-teal-checkbox" class="teal-checkbox" checked>
            <span class="checkmark"></span>
            Track in Teal?
          </label>
        </div>
        -->

        <div class="form-field">
          <label for="reminder-priority">Priority:</label>
          <select id="reminder-priority" class="priority-select">
            <option value="9">Low</option>
            <option value="5" selected>Medium</option>
            <option value="1">High</option>
          </select>
        </div>

        <div class="form-field">
          <label>Create Reminders:</label>
          <div class="reminder-checkboxes">
            <label class="reminder-checkbox-label">
              <input type="checkbox" id="reminder-track" class="reminder-checkbox" checked>
              <span>📋 Track Application</span>
            </label>
            <label class="reminder-checkbox-label">
              <input type="checkbox" id="reminder-apply" class="reminder-checkbox" checked>
              <span>✍️ Apply</span>
            </label>
            <label class="reminder-checkbox-label">
              <input type="checkbox" id="reminder-ping" class="reminder-checkbox" checked>
              <span>📞 Ping Recruiter</span>
            </label>
            <label class="reminder-checkbox-label">
              <input type="checkbox" id="reminder-prep" class="reminder-checkbox" checked>
              <span>🎯 Interview Prep</span>
            </label>
            <label class="reminder-checkbox-label">
              <input type="checkbox" id="reminder-followup" class="reminder-checkbox" checked>
              <span>📧 Follow-up</span>
            </label>
          </div>
        </div>

        <div class="button-group">
          <button id="track-job-info" class="track-btn">Track</button>
        </div>
      </div>

      <!-- Job Scoring Section -->
      <div class="section scoring-section">
        <h4 class="section-header">📊 Job Scoring Report</h4>
        <p class="section-description">AI-powered job compatibility analysis</p>

        <div id="scoring-status" class="scoring-status">
          <span id="scoring-status-text">Track a job to generate scoring report</span>
        </div>

        <div class="button-row">
          <button id="generate-score" class="action-btn score-btn" style="display: none;">
            ✨ Generate Score
          </button>
          <button id="view-report" class="action-btn report-btn" style="display: none;">
            📊 View Report
          </button>
        </div>
      </div>
    </div>
  `;
  
  document.body.appendChild(gutterElement);
  
  // Add close button functionality
  document.getElementById('close-gutter').addEventListener('click', closeGutter);
  
  // Add submit button functionality
  document.getElementById('submit-query').addEventListener('click', handleLLMQuery);
  
  // Add Enter key functionality for input
  document.getElementById('llm-input').addEventListener('keydown', function(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleLLMQuery();
    }
  });
  
  
  // Add track job from form fields functionality
  document.getElementById('track-job-info').addEventListener('click', handleTrackFromForm);

  // Add view report button functionality
  document.getElementById('view-report').addEventListener('click', handleViewReport);

  // Add generate score button functionality
  document.getElementById('generate-score').addEventListener('click', handleGenerateScore);

  // Add generate blurb button functionality for both persons
  document.getElementById('generate-third-person-blurb').addEventListener('click', () => handleGenerateBlurb('third'));
  document.getElementById('generate-first-person-blurb').addEventListener('click', () => handleGenerateBlurb('first'));

  // Add copy blurb button functionality
  document.getElementById('copy-third-person-blurb').addEventListener('click', () => handleCopyBlurb('third'));
  document.getElementById('copy-first-person-blurb').addEventListener('click', () => handleCopyBlurb('first'));

  // Add generate resume button functionality
  document.getElementById('generate-resume-btn').addEventListener('click', handleGenerateResume);

  // Add resume Google Drive link functionality
  document.getElementById('save-resume-drive-url').addEventListener('click', handleSaveResumeDriveUrl);
  document.getElementById('edit-resume-drive-url').addEventListener('click', handleEditResumeDriveUrl);

  // Add search connections button functionality
  document.getElementById('search-connections').addEventListener('click', handleSearchConnections);

  // Add company name field change listener to update connections section
  document.getElementById('company-name').addEventListener('input', debounce((e) => {
    updateConnectionsSection(e.target.value.trim());
  }, 300));

  // Add company name field change listener to update company stage
  document.getElementById('company-name').addEventListener('input', debounce(async (e) => {
    const companyName = e.target.value.trim();
    if (companyName) {
      // First try to get from description
      let stage = extractCompanyStage();

      // If not found in description, try API lookup (future enhancement)
      if (!stage) {
        stage = await fetchCompanyStage(companyName);
      }

      const companyStageField = document.getElementById('company-stage');
      if (companyStageField) {
        companyStageField.value = stage;
      }
    }
  }, 500));

  // Always reset to local mode on page load to avoid unexpected token usage
  resetExtractionModeToLocal();

  // Re-extract when user explicitly changes extraction mode
  document.getElementById('extraction-mode').addEventListener('change', async (e) => {
    const mode = e.target.value;
    console.log('Career Catalyst: Extraction mode changed to:', mode);

    // Re-run extraction when mode changes
    console.log('Career Catalyst: Re-extracting job information with new mode');
    await extractJobInformation();
  });

  // Add job ID field change listener to update scoring, resume, and blurb sections
  document.getElementById('job-id').addEventListener('input', debounce(async (e) => {
    const jobId = e.target.value.trim();
    await updateScoringSection(jobId);
    await updateResumeSection(jobId);
    await updateBlurbSection(jobId, 'third');
    await updateBlurbSection(jobId, 'first');
  }, 500)); // Debounce to avoid too many requests while typing

  // Run automatic LOCAL extraction after page content loads (free, no API calls, no reminders)
  // Server extraction and tracking only happen when user explicitly requests them
  // Wait 2 seconds to allow dynamic content to render
  setTimeout(() => {
    console.log('Career Catalyst: Running automatic local extraction (free)');
    extractJobInformationLocal();
  }, 2000);

  // Analyze page content for questions
  analyzePageContent();
  
  console.log('Career Catalyst: Gutter created');
}

// Helper function to disable/enable form fields during extraction
function setFormFieldsDisabled(disabled) {
  const fieldIds = [
    'job-title',
    'company-name',
    'job-location',
    'min-salary',
    'max-salary',
    'job-url',
    'job-description',
    'extraction-mode',
    'reminder-priority',
    'track-job-info'
  ];

  fieldIds.forEach(id => {
    const element = document.getElementById(id);
    if (element) {
      element.disabled = disabled;
      if (disabled) {
        element.style.opacity = '0.6';
        element.style.cursor = 'not-allowed';
      } else {
        element.style.opacity = '1';
        element.style.cursor = '';
      }
    }
  });

  // Show/hide loading indicator
  const extractionModeSelect = document.getElementById('extraction-mode');
  if (extractionModeSelect && extractionModeSelect.parentElement) {
    let loadingIndicator = document.getElementById('extraction-loading');

    if (disabled && !loadingIndicator) {
      // Create loading indicator
      loadingIndicator = document.createElement('p');
      loadingIndicator.id = 'extraction-loading';
      loadingIndicator.className = 'help-text';
      loadingIndicator.style.color = '#1a73e8';
      loadingIndicator.style.fontWeight = '600';
      loadingIndicator.innerHTML = '🔄 Extracting job data via LLM...';
      extractionModeSelect.parentElement.appendChild(loadingIndicator);
    } else if (!disabled && loadingIndicator) {
      // Remove loading indicator
      loadingIndicator.remove();
    }
  }
}

// Extract comprehensive job information from the current page
async function extractJobInformation() {
  console.log('🔍 Career Catalyst: Starting job information extraction');
  console.log('🔍 Current page URL:', window.location.href);
  console.log('🔍 Page title:', document.title);

  // Check if job ID is already set - if so, load from logs instead of re-extracting
  const jobIdField = document.getElementById('job-id');
  const existingJobId = jobIdField?.value?.trim();

  if (existingJobId) {
    console.log('🔍 Career Catalyst: Job ID already set, loading from logs:', existingJobId);
    try {
      const response = await chrome.runtime.sendMessage({
        action: 'loadJobFromLogs',
        jobId: existingJobId
      });

      if (response && response.success && response.jobData) {
        console.log('🔍 Career Catalyst: Loaded job data from logs');
        populateFieldsFromJobData(response.jobData, existingJobId);
        return;
      } else {
        console.warn('🔍 Career Catalyst: Failed to load from logs, will re-extract');
      }
    } catch (error) {
      console.error('🔍 Career Catalyst: Error loading from logs:', error);
    }
  }

  // Check extraction mode setting
  const extractionModeSelect = document.getElementById('extraction-mode');
  const extractionMode = extractionModeSelect ? extractionModeSelect.value : 'local';

  console.log('🔍 Career Catalyst: Extraction mode:', extractionMode);

  if (extractionMode === 'server') {
    // Use server-side LLM extraction (costs API tokens but more accurate)
    try {
      console.log('🔍 Career Catalyst: Using server-side LLM extraction');

      // Disable form fields during extraction
      setFormFieldsDisabled(true);

      // Call background script to perform robust extraction using URL
      // Note: URL-based extraction works better than HTML-based for LinkedIn
      // because the full page HTML (1MB+) is too large for effective LLM processing
      console.log('🔍 Career Catalyst: Using URL-based extraction for better results');
      const response = await chrome.runtime.sendMessage({
        action: 'extractJob',
        url: window.location.href
        // Note: Not sending HTML, let server fetch it directly for better results
      });

      if (response && response.success && response.jobData) {
        console.log('🔍 Career Catalyst: Server extraction successful');
        console.log('🔍 Career Catalyst: Job data:', response.jobData);
        console.log('🔍 Career Catalyst: Job ID:', response.jobId);
        populateFieldsFromJobData(response.jobData, response.jobId);
      } else {
        console.error('🔍 Career Catalyst: Server extraction failed, falling back to local extraction');
        extractJobInformationLocal();
      }
    } catch (error) {
      console.error('🔍 Career Catalyst: Error during server extraction:', error);
      console.log('🔍 Career Catalyst: Falling back to local extraction');
      extractJobInformationLocal();
    } finally {
      // Re-enable form fields after extraction
      setFormFieldsDisabled(false);
    }
  } else {
    // Use local regex extraction (default, fast and free)
    console.log('🔍 Career Catalyst: Using local regex extraction');
    extractJobInformationLocal();
  }
}

// Helper function to populate fields from job data
function populateFieldsFromJobData(jobData, jobId) {
  // Set job ID if provided
  const jobIdField = document.getElementById('job-id');
  if (jobIdField && jobId) {
    jobIdField.value = jobId;
    jobIdField.dispatchEvent(new Event('input', { bubbles: true }));
    console.log('💾 Populated job ID field:', jobId);
  }

  const titleField = document.getElementById('job-title');
  if (titleField && jobData.title) {
    titleField.value = jobData.title;
    titleField.dispatchEvent(new Event('input', { bubbles: true }));
  }

  const companyField = document.getElementById('company-name');
  if (companyField && jobData.company) {
    companyField.value = jobData.company;
    companyField.dispatchEvent(new Event('input', { bubbles: true }));
  }

  const locationField = document.getElementById('job-location');
  if (locationField && jobData.location) {
    locationField.value = jobData.location;
    locationField.dispatchEvent(new Event('input', { bubbles: true }));
  }

  const descriptionField = document.getElementById('job-description');
  if (descriptionField && jobData.description) {
    descriptionField.value = jobData.description;
    extractedJobDescription = jobData.description;
  }

  const minSalaryField = document.getElementById('min-salary');
  const maxSalaryField = document.getElementById('max-salary');
  if (jobData.salaryMin && minSalaryField) {
    minSalaryField.value = jobData.salaryMin;
    minSalaryField.dispatchEvent(new Event('input', { bubbles: true }));
  }
  if (jobData.salaryMax && maxSalaryField) {
    maxSalaryField.value = jobData.salaryMax;
    maxSalaryField.dispatchEvent(new Event('input', { bubbles: true }));
  }

  const urlField = document.getElementById('job-url');
  if (urlField) urlField.value = window.location.href;

  // Extract and populate reports-to and company-stage fields from the description
  if (jobData.description) {
    extractedJobDescription = jobData.description;

    const reportsTo = extractReportsTo();
    const reportsToField = document.getElementById('reports-to');
    if (reportsToField) {
      reportsToField.value = reportsTo;
      reportsToField.dispatchEvent(new Event('input', { bubbles: true }));
    }

    const companyStage = extractCompanyStage();
    const companyStageField = document.getElementById('company-stage');
    if (companyStageField) {
      companyStageField.value = companyStage;
      companyStageField.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }

  console.log('Career Catalyst: Job information populated:', {
    title: jobData.title,
    company: jobData.company,
    location: jobData.location,
    salary: {
      min: jobData.salaryMin,
      max: jobData.salaryMax
    },
    url: window.location.href,
    hasDescription: !!(jobData.description && jobData.description.length > 0)
  });
}

// Local regex-based extraction (fast and free)
function extractJobInformationLocal() {
  console.log('🔍 Career Catalyst: Using local regex-based extraction');

  // Extract job title
  const jobTitle = extractJobTitle();
  const titleField = document.getElementById('job-title');
  if (titleField) {
    titleField.value = jobTitle;
    titleField.dispatchEvent(new Event('input', { bubbles: true }));
  }

  // Extract company name
  const companyName = extractCompanyName();
  const companyField = document.getElementById('company-name');
  if (companyField) {
    companyField.value = companyName;
    companyField.dispatchEvent(new Event('input', { bubbles: true }));
  }

  // Extract location
  const location = extractJobLocation();
  const locationField = document.getElementById('job-location');
  if (locationField) {
    const cleanedLocation = location && location.trim().length > 0 ? location : '';
    locationField.value = cleanedLocation;
    locationField.dispatchEvent(new Event('input', { bubbles: true }));
  }

  // Extract job description
  extractJobDescription();
  const descriptionField = document.getElementById('job-description');
  if (descriptionField) descriptionField.value = extractedJobDescription;

  // Extract salary information
  const salaryInfo = extractSalaryRange();
  const minSalaryField = document.getElementById('min-salary');
  const maxSalaryField = document.getElementById('max-salary');
  if (minSalaryField && salaryInfo.min) {
    minSalaryField.value = salaryInfo.min;
    minSalaryField.dispatchEvent(new Event('input', { bubbles: true }));
  }
  if (maxSalaryField && salaryInfo.max) {
    maxSalaryField.value = salaryInfo.max;
    maxSalaryField.dispatchEvent(new Event('input', { bubbles: true }));
  }

  // Set the current URL
  const urlField = document.getElementById('job-url');
  if (urlField) urlField.value = window.location.href;

  // Extract reports-to information
  const reportsTo = extractReportsTo();
  const reportsToField = document.getElementById('reports-to');
  if (reportsToField) {
    reportsToField.value = reportsTo;
    reportsToField.dispatchEvent(new Event('input', { bubbles: true }));
  }

  // Extract company stage information
  const companyStage = extractCompanyStage();
  const companyStageField = document.getElementById('company-stage');
  if (companyStageField) {
    companyStageField.value = companyStage;
    companyStageField.dispatchEvent(new Event('input', { bubbles: true }));
  }

  console.log('Career Catalyst: Basic extraction completed');
}

// Extract job title from the current page
function extractJobTitle() {
  const titleSelectors = [
    'h1[data-testid*="job"]',
    'h1[data-testid*="title"]',
    '[data-testid*="job-title"]',
    '[data-testid*="jobTitle"]',
    '.job-title',
    '.position-title',
    '.role-title',
    'h1:first-of-type',
    '.job-header h1',
    '.job-post-title',
    '[class*="job"][class*="title"]',
    '[data-automation-id*="title"]'
  ];
  
  for (const selector of titleSelectors) {
    const element = document.querySelector(selector);
    if (element && element.textContent.trim()) {
      return cleanText(element.textContent);
    }
  }
  
  // Fallback: try to extract from page title
  const pageTitle = document.title.split('|')[0].split('-')[0].split('at')[0].trim();
  if (pageTitle && pageTitle.length > 3) {
    return pageTitle;
  }
  
  return '';
}

// Extract company name from the current page
function extractCompanyName() {
  console.log('🔍 Career Catalyst: Extracting company name');
  
  // Priority 1: Look for company in job description or visible text content
  const descText = extractedJobDescription || document.body.innerText || '';
  
  // Check for specific company patterns in content
  const companyMatches = [
    descText.match(/work(?:ing)?\s+(?:at|for)\s+([A-Z][A-Za-z\s&]+?)(?:\s|,|\.|!|\?|$)/i),
    descText.match(/([A-Z][A-Za-z\s&]+?)\s+is\s+(?:a|an|the)/i),
    descText.match(/join\s+(?:the\s+)?([A-Z][A-Za-z\s&]+?)\s+team/i),
    descText.match(/([A-Z][A-Za-z\s&]+?)\s+(?:team|company|organization)/i)
  ];
  
  for (const match of companyMatches) {
    if (match && match[1]) {
      const company = cleanText(match[1]);
      // Filter out common false positives
      if (company && company.length > 2 && company.length < 50 &&
          !company.toLowerCase().includes('engineering') &&
          !company.toLowerCase().includes('product') &&
          !company.toLowerCase().includes('software') &&
          !company.toLowerCase().includes('technical') &&
          !company.toLowerCase().includes('development')) {
        console.log(`🔍 Found company from content: "${company}"`);
        return company;
      }
    }
  }
  
  // Priority 2: DOM-based selectors
  const companySelectors = [
    '[data-testid*="company"]',
    '.company-name',
    '.employer-name',
    '.job-company',
    '[class*="company"][class*="name"]',
    '[data-automation-id*="company"]',
    '.company',
    '[class*="employer"]'
  ];
  
  for (const selector of companySelectors) {
    const element = document.querySelector(selector);
    if (element && element.textContent.trim()) {
      const company = cleanText(element.textContent);
      console.log(`🔍 Found company from selector "${selector}": "${company}"`);
      return company;
    }
  }
  
  // Priority 3: Specific site handling
  if (window.location.href.includes('linear.app/careers')) {
    return 'Linear';
  }
  
  // Handle Rippling ATS - extract company from URL path
  if (window.location.hostname.includes('rippling.com') && window.location.pathname.includes('join')) {
    const pathParts = window.location.pathname.split('/');
    const joinIndex = pathParts.findIndex(part => part.startsWith('join'));
    if (joinIndex >= 0 && pathParts[joinIndex].length > 4) {
      const companySlug = pathParts[joinIndex].replace('join', '');
      // Convert slug to proper company name
      const companyNames = {
        'root': 'Root Insurance',
        'stripe': 'Stripe', 
        'airbnb': 'Airbnb',
        'uber': 'Uber',
        'lyft': 'Lyft'
        // Add more as needed
      };
      if (companyNames[companySlug.toLowerCase()]) {
        console.log(`🔍 Found company from Rippling URL: "${companyNames[companySlug.toLowerCase()]}"`);
        return companyNames[companySlug.toLowerCase()];
      }
      // Fallback: capitalize the slug
      const capitalizedCompany = companySlug.charAt(0).toUpperCase() + companySlug.slice(1);
      console.log(`🔍 Found company from Rippling URL (capitalized): "${capitalizedCompany}"`);
      return capitalizedCompany;
    }
  }
  
  // Priority 4: Check for company logo or branding elements
  const logoSelectors = ['[alt*="logo" i]', '[class*="logo"]', 'img[src*="logo"]'];
  for (const selector of logoSelectors) {
    const element = document.querySelector(selector);
    if (element) {
      const alt = element.getAttribute('alt');
      if (alt && alt.toLowerCase().includes('logo')) {
        const company = alt.replace(/logo/gi, '').trim();
        console.log(`🔍 Found company from logo: "${company}"`);
        return company;
      }
    }
  }
  
  // Priority 5: Meta tags
  const metaCompany = document.querySelector('meta[property="og:site_name"]');
  if (metaCompany && metaCompany.content) {
    console.log(`🔍 Found company from meta tag: "${metaCompany.content}"`);
    return metaCompany.content;
  }
  
  // Priority 6: Try extracting from page title (after "at")
  const titleParts = document.title.split(' at ');
  if (titleParts.length > 1) {
    const company = titleParts[1].split('|')[0].split('-')[0].trim();
    console.log(`🔍 Found company from page title: "${company}"`);
    return company;
  }
  
  // Last resort: Try extracting from URL subdomain (but avoid common false positives)
  const hostname = window.location.hostname;
  const parts = hostname.split('.');
  if (parts.length >= 2 && parts[0] !== 'www' && parts[0] !== 'ats' && parts[0] !== 'jobs' && parts[0] !== 'careers') {
    const company = parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
    console.log(`🔍 Found company from hostname: "${company}"`);
    return company;
  }
  
  console.log('🔍 No company name found');
  return '';
}

// Extract job location from the current page
function extractJobLocation() {
  console.log('Career Catalyst: Extracting job location from page');
  
  // Priority 1: Try specific location selectors first
  const locationSelectors = [
    '[data-testid*="location"]',
    '[data-testid*="jobLocation"]',
    '.job-location',
    '.position-location', 
    '[data-automation-id*="location"]',
    '.job-info .location',
    '[class*="job"][class*="location"]',
    '.location-info'
  ];
  
  for (const selector of locationSelectors) {
    const element = document.querySelector(selector);
    if (element && element.textContent.trim()) {
      const cleaned = cleanText(element.textContent);
      console.log(`Career Catalyst: Found location via selector "${selector}": "${cleaned}"`);
      // Filter out obvious non-location text
      if (cleaned && 
          cleaned.length > 0 && 
          cleaned.length < 100 &&
          !cleaned.toLowerCase().includes('salary') &&
          !cleaned.toLowerCase().includes('priority') &&
          !cleaned.toLowerCase().includes('track') &&
          !cleaned.toLowerCase().includes('description') &&
          !cleaned.toLowerCase().includes('url')) {
        return cleaned;
      }
    }
  }
  
  // Priority 2: Look for structured data
  const jsonLdElements = document.querySelectorAll('script[type="application/ld+json"]');
  for (const element of jsonLdElements) {
    try {
      const data = JSON.parse(element.textContent);
      if (data['@type'] === 'JobPosting' && data.jobLocation) {
        if (data.jobLocation.address) {
          const location = data.jobLocation.address.addressLocality || 
                          data.jobLocation.address.addressRegion ||
                          data.jobLocation.address.name;
          if (location) {
            console.log(`Career Catalyst: Found location in JSON-LD: "${location}"`);
            return cleanText(location);
          }
        }
        if (typeof data.jobLocation === 'string') {
          console.log(`Career Catalyst: Found location string in JSON-LD: "${data.jobLocation}"`);
          return cleanText(data.jobLocation);
        }
      }
    } catch (e) {
      // Continue to next element
    }
  }
  
  // Priority 3: Look for common location text patterns in main content area only
  const mainContentSelectors = [
    'main', 
    '[role="main"]', 
    '.job-content', 
    '.job-description',
    '.job-details',
    '.job-header',
    '.job-info'
  ];
  
  let searchArea = document.body;
  for (const selector of mainContentSelectors) {
    const element = document.querySelector(selector);
    if (element) {
      searchArea = element;
      break;
    }
  }
  
  const textContent = searchArea.textContent || '';
  const locationPatterns = [
    /(?:Location|Based in|Office|Work from|City):\s*([^\n\r\.,;]+)/i,
    /(?:^|\n|\r)\s*Location:\s*([^\n\r\.,;]+)/i,
    /(?:Remote|Hybrid|On-site)\s*[-,]?\s*([A-Za-z\s,]{2,40})(?=\s|$|\n)/i
  ];
  
  for (const pattern of locationPatterns) {
    const match = textContent.match(pattern);
    if (match && match[1]) {
      const locationText = cleanText(match[1].trim());
      console.log(`Career Catalyst: Found location via pattern: "${locationText}"`);
      if (locationText && 
          locationText.length > 1 && 
          locationText.length < 50 &&
          !locationText.toLowerCase().includes('salary') &&
          !locationText.toLowerCase().includes('priority') &&
          !locationText.toLowerCase().includes('track') &&
          !locationText.toLowerCase().includes('description') &&
          !locationText.toLowerCase().includes('url')) {
        return locationText;
      }
    }
  }
  
  // Priority 4: Look for specific location keywords but exclude form elements
  const locationKeywords = ['Remote', 'Hybrid', 'On-site', 'San Francisco', 'New York', 'London', 'Berlin', 'Austin', 'Seattle', 'Boston', 'Chicago', 'Los Angeles', 'Toronto', 'Vancouver'];
  
  // Get all text elements but exclude form elements and our extension
  const allTextElements = Array.from(document.querySelectorAll('*:not(input):not(textarea):not(select):not(button):not(label):not(#job-extractor-gutter):not(#job-extractor-gutter *)'))
    .filter(el => {
      const text = el.textContent?.trim();
      return text && 
             text.length < 50 && 
             text.length > 2 &&
             el.children.length === 0 && // Only leaf text nodes
             !el.closest('#job-extractor-gutter'); // Exclude our extension
    })
    .map(el => el.textContent.trim());
  
  for (const keyword of locationKeywords) {
    const found = allTextElements.find(text => 
      text.includes(keyword) && 
      !text.toLowerCase().includes('experience') && 
      !text.toLowerCase().includes('requirements') &&
      !text.toLowerCase().includes('skills') &&
      !text.toLowerCase().includes('salary') &&
      !text.toLowerCase().includes('priority') &&
      !text.toLowerCase().includes('track') &&
      !text.toLowerCase().includes('description') &&
      !text.toLowerCase().includes('url') &&
      text.length < 40
    );
    if (found) {
      const cleaned = cleanText(found);
      console.log(`Career Catalyst: Found location via keyword "${keyword}": "${cleaned}"`);
      if (cleaned && cleaned.length > 0 && cleaned.length < 40) {
        return cleaned;
      }
    }
  }
  
  console.log('Career Catalyst: No location found');
  return '';
}

// Extract salary range from the current page
function extractSalaryRange() {
  console.log('🔍 Career Catalyst: Extracting salary range');
  
  // Get all text content to search for salary patterns
  const pageText = document.body.innerText || '';
  const descText = extractedJobDescription || '';
  const combinedText = descText + '\n' + pageText;
  
  // Comprehensive salary patterns
  const salaryPatterns = [
    // Standard formats: $300,000-450,000, $300K-$450K, etc.
    /\$(\d{1,3}(?:,\d{3})*|\d+[kK]?)\s*[-–—to]\s*\$?(\d{1,3}(?:,\d{3})*|\d+[kK]?)/gi,
    // Range with "to": $300,000 to $450,000
    /\$(\d{1,3}(?:,\d{3})*|\d+[kK]?)\s+to\s+\$?(\d{1,3}(?:,\d{3})*|\d+[kK]?)/gi,
    // Range with "and": between $300,000 and $450,000
    /between\s+\$(\d{1,3}(?:,\d{3})*|\d+[kK]?)\s+and\s+\$?(\d{1,3}(?:,\d{3})*|\d+[kK]?)/gi,
    // Salary range: text
    /salary\s+range:?\s*\$(\d{1,3}(?:,\d{3})*|\d+[kK]?)\s*[-–—to]\s*\$?(\d{1,3}(?:,\d{3})*|\d+[kK]?)/gi,
    // Compensation: text  
    /compensation:?\s*\$(\d{1,3}(?:,\d{3})*|\d+[kK]?)\s*[-–—to]\s*\$?(\d{1,3}(?:,\d{3})*|\d+[kK]?)/gi,
    // Base salary: text
    /base\s+salary:?\s*\$(\d{1,3}(?:,\d{3})*|\d+[kK]?)\s*[-–—to]\s*\$?(\d{1,3}(?:,\d{3})*|\d+[kK]?)/gi
  ];
  
  for (const pattern of salaryPatterns) {
    const matches = combinedText.matchAll(pattern);
    for (const match of matches) {
      if (match[1] && match[2]) {
        const min = parseSalaryValue(match[1]);
        const max = parseSalaryValue(match[2]);
        
        // Validate that the range makes sense
        if (min > 0 && max > 0 && min < max && min >= 20000 && max <= 2000000) {
          console.log(`🔍 Found salary range: $${min.toLocaleString()} - $${max.toLocaleString()}`);
          return {
            min: min.toString(),
            max: max.toString()
          };
        }
      }
    }
  }
  
  // Look for single salary values that might indicate a range midpoint
  const singleSalaryPatterns = [
    /salary:?\s*\$(\d{1,3}(?:,\d{3})*|\d+[kK]?)/gi,
    /compensation:?\s*\$(\d{1,3}(?:,\d{3})*|\d+[kK]?)/gi,
    /\$(\d{1,3}(?:,\d{3})*|\d+[kK]?)\s+(?:per\s+year|annually|salary)/gi
  ];
  
  for (const pattern of singleSalaryPatterns) {
    const matches = combinedText.matchAll(pattern);
    for (const match of matches) {
      if (match[1]) {
        const salary = parseSalaryValue(match[1]);
        if (salary >= 50000 && salary <= 1000000) {
          // Estimate a range around the single value (±20%)
          const min = Math.round(salary * 0.8);
          const max = Math.round(salary * 1.2);
          console.log(`🔍 Found single salary value, estimating range: $${min.toLocaleString()} - $${max.toLocaleString()}`);
          return {
            min: min.toString(),
            max: max.toString()
          };
        }
      }
    }
  }
  
  console.log('🔍 No salary range found');
  return { min: '', max: '' };
}

// Helper function to parse salary values (handles K suffix and commas)
function parseSalaryValue(value) {
  if (!value) return 0;

  // Remove commas and dollar signs
  let cleaned = value.replace(/[\$,]/g, '');

  // Handle K suffix
  if (cleaned.toLowerCase().endsWith('k')) {
    return parseInt(cleaned.slice(0, -1)) * 1000;
  }

  return parseInt(cleaned) || 0;
}

// Extract "Reports to:" information from job description
function extractReportsTo() {
  console.log('🔍 Career Catalyst: Extracting reports-to information');

  const descText = extractedJobDescription || document.body.innerText || '';

  // Comprehensive patterns to find reporting relationships
  const reportsToPatterns = [
    // Direct patterns: "reports to [title]", "reporting to [title]"
    /reports?\s+(?:directly\s+)?to\s+(?:the\s+)?([A-Z][A-Za-z\s,&\/]+?)(?:\s+and|\s+or|\.|\,|\n|$)/i,
    /reporting\s+(?:directly\s+)?to\s+(?:the\s+)?([A-Z][A-Za-z\s,&\/]+?)(?:\s+and|\s+or|\.|\,|\n|$)/i,

    // "This role reports to [title]"
    /this\s+(?:role|position)\s+reports?\s+(?:directly\s+)?to\s+(?:the\s+)?([A-Z][A-Za-z\s,&\/]+?)(?:\s+and|\s+or|\.|\,|\n|$)/i,

    // "You will report to [title]"
    /you\s+(?:will\s+)?report\s+(?:directly\s+)?to\s+(?:the\s+)?([A-Z][A-Za-z\s,&\/]+?)(?:\s+and|\s+or|\.|\,|\n|$)/i,

    // "[Title] will report to [title]"
    /[A-Z][A-Za-z\s]+?\s+will\s+report\s+(?:directly\s+)?to\s+(?:the\s+)?([A-Z][A-Za-z\s,&\/]+?)(?:\s+and|\s+or|\.|\,|\n|$)/i,

    // "Reports directly to: [title]"
    /reports?\s+(?:directly\s+)?to:\s*([A-Z][A-Za-z\s,&\/]+?)(?:\s+and|\s+or|\.|\,|\n|$)/i
  ];

  for (const pattern of reportsToPatterns) {
    const match = descText.match(pattern);
    if (match && match[1]) {
      let reportsTo = match[1].trim();

      // Clean up the extracted text
      reportsTo = reportsTo
        .replace(/\s+/g, ' ')  // Normalize whitespace
        .replace(/\s*[,.]$/, '')  // Remove trailing punctuation
        .trim();

      // Validate that it looks like a job title (not too long, has reasonable content)
      if (reportsTo.length > 3 && reportsTo.length < 100) {
        console.log(`🔍 Found reports-to: "${reportsTo}"`);
        return reportsTo;
      }
    }
  }

  console.log('🔍 No reports-to information found');
  return '';
}

// Extract company stage from job description
function extractCompanyStage() {
  console.log('🔍 Career Catalyst: Extracting company stage');

  const descText = extractedJobDescription || document.body.innerText || '';
  const lowerText = descText.toLowerCase();

  // Define stage patterns with their labels
  const stagePatterns = [
    // Funding rounds
    { pattern: /\bseries\s+[a-e]\b/i, label: (match) => match[0].toUpperCase() },
    { pattern: /\bseed(?:\s+stage|\s+funded)?\b/i, label: 'Seed' },
    { pattern: /\bpre-seed\b/i, label: 'Pre-seed' },

    // Company maturity
    { pattern: /\bpublicly\s+traded\b/i, label: 'Public' },
    { pattern: /\bpublic\s+company\b/i, label: 'Public' },
    { pattern: /\bipo\b/i, label: 'Public/IPO' },
    { pattern: /\bfortune\s+\d+\b/i, label: 'Fortune 500' },

    // Startup stages
    { pattern: /\bearly[-\s]stage\s+startup\b/i, label: 'Early-stage Startup' },
    { pattern: /\blate[-\s]stage\s+startup\b/i, label: 'Late-stage Startup' },
    { pattern: /\bgrowth[-\s]stage\s+startup\b/i, label: 'Growth-stage Startup' },
    { pattern: /\bstartup\b/i, label: 'Startup' },

    // Established companies
    { pattern: /\bestablished\s+company\b/i, label: 'Established' },
    { pattern: /\benterprise\s+company\b/i, label: 'Enterprise' },
    { pattern: /\bwell[-\s]funded\b/i, label: 'Well-funded' },

    // Private equity / Venture backed
    { pattern: /\bventure[-\s]backed\b/i, label: 'Venture-backed' },
    { pattern: /\bvc[-\s]backed\b/i, label: 'VC-backed' },
    { pattern: /\bprivate\s+equity\b/i, label: 'Private Equity' },
  ];

  // Try to find the most specific match
  for (const { pattern, label } of stagePatterns) {
    const match = descText.match(pattern);
    if (match) {
      const stage = typeof label === 'function' ? label(match) : label;
      console.log(`🔍 Found company stage: "${stage}"`);
      return stage;
    }
  }

  console.log('🔍 No company stage information found');
  return '';
}

// Fetch company stage from external sources (Tracxn, etc.)
async function fetchCompanyStage(companyName) {
  console.log('🔍 Career Catalyst: Fetching company stage for:', companyName);

  if (!companyName || companyName.trim().length === 0) {
    return '';
  }

  try {
    console.log('🔍 Calling LinkedIn API to get company stage...');

    const response = await chrome.runtime.sendMessage({
      action: 'getCompanyStage',
      companyName: companyName
    });

    if (response.success && response.stage) {
      console.log('🔍 Successfully fetched company stage from LinkedIn:', response.stage);
      return response.stage;
    } else {
      console.log('🔍 No stage information found on LinkedIn');
      return '';
    }
  } catch (error) {
    console.error('🔍 Error fetching company stage from LinkedIn:', error);
    return '';
  }
}

// Extract job description from the current page
function extractJobDescription() {
  try {
    console.log('Career Catalyst: Extracting job description from page');
    
    // Strategy 1: Look for JSON-LD structured data first (similar to CLI tool)
    const jsonLdElements = document.querySelectorAll('script[type="application/ld+json"]');
    for (const element of jsonLdElements) {
      try {
        const data = JSON.parse(element.textContent);
        if (data['@type'] === 'JobPosting' && data.description) {
          extractedJobDescription = cleanText(data.description);
          console.log('Career Catalyst: Found job description in JSON-LD');
          return;
        }
      } catch (e) {
        continue;
      }
    }
    
    // Strategy 2: Look for common job description patterns
    const jobDescriptionSelectors = [
      // Common job site patterns
      '[data-testid*="job-description"]',
      '[data-testid*="jobDescription"]',
      '.job-description',
      '.job-content',
      '.job-details',
      '.job-summary',
      '.position-description',
      '.role-description',
      '#job-description',
      '#job-content',
      '#job-details',
      
      // Workday patterns
      '[data-automation-id*="jobPostingDescription"]',
      '[data-automation-id*="job-description"]',
      
      // Greenhouse patterns
      '#content .section:first-of-type',
      '.job-post__content',
      
      // LinkedIn patterns
      '.jobs-description-content__text',
      '.jobs-description__container',
      
      // Generic patterns
      '[class*="job"][class*="description"]',
      '[class*="position"][class*="description"]',
      '[id*="job"][id*="description"]'
    ];
    
    for (const selector of jobDescriptionSelectors) {
      const element = document.querySelector(selector);
      if (element && element.textContent.trim().length > 100) {
        extractedJobDescription = cleanText(element.textContent);
        console.log(`Career Catalyst: Found job description using selector: ${selector}`);
        return;
      }
    }
    
    // Strategy 3: Look for main content areas and extract the longest text block
    const mainContentSelectors = ['main', '[role="main"]', '.main-content', '#main-content', '.content'];
    for (const selector of mainContentSelectors) {
      const mainElement = document.querySelector(selector);
      if (mainElement) {
        const textBlocks = Array.from(mainElement.querySelectorAll('p, div'))
          .map(el => el.textContent.trim())
          .filter(text => text.length > 200)
          .sort((a, b) => b.length - a.length);
        
        if (textBlocks.length > 0) {
          extractedJobDescription = cleanText(textBlocks[0]);
          console.log('Career Catalyst: Found job description in main content area');
          return;
        }
      }
    }
    
    // Strategy 4: Fallback - get the longest paragraph on the page
    const allParagraphs = Array.from(document.querySelectorAll('p, div'))
      .filter(el => !el.closest('#job-extractor-gutter')) // Exclude our own content
      .map(el => el.textContent.trim())
      .filter(text => text.length > 150 && !isNavigationalText(text))
      .sort((a, b) => b.length - a.length);
    
    if (allParagraphs.length > 0) {
      extractedJobDescription = cleanText(allParagraphs[0]);
      console.log('Career Catalyst: Found job description using fallback method');
      return;
    }
    
    // If nothing found, set a helpful message
    extractedJobDescription = 'No job description could be automatically extracted from this page. Please paste the job description manually.';
    console.log('Career Catalyst: No job description found');
    
  } catch (error) {
    console.error('Career Catalyst: Error extracting job description:', error);
    extractedJobDescription = 'Error extracting job description. Please paste manually.';
  }
}

// Clean extracted text
function cleanText(text) {
  if (!text) return '';
  
  return text
    .replace(/[\u200B-\u200D\uFEFF]/g, '') // Remove zero-width characters
    .replace(/&nbsp;/g, ' ') // Replace &nbsp; with space
    .replace(/&amp;/g, '&') // Replace &amp; with &
    .replace(/&lt;/g, '<') // Replace &lt; with <
    .replace(/&gt;/g, '>') // Replace &gt; with >
    .replace(/&quot;/g, '"') // Replace &quot; with "
    .replace(/[\r\n\t]+/g, ' ') // Replace line breaks and tabs with space
    .replace(/\s+/g, ' ') // Replace multiple whitespace with single space
    .trim()
    .substring(0, 2000); // Limit length to avoid overly long descriptions
}

// Check if text looks like navigation/header/footer content
function isNavigationalText(text) {
  const navPatterns = [
    /^(home|about|contact|login|register|sign in|menu)/i,
    /^(copyright|privacy|terms|cookies)/i,
    /^(search|filter|sort by)/i,
    /^(next|previous|page \d+)/i,
    /(navigation|breadcrumb|footer|header)/i
  ];
  
  return navPatterns.some(pattern => pattern.test(text)) || text.length < 50;
}

// Handle LLM query submission
async function handleLLMQuery() {
  const input = document.getElementById('llm-input');
  const submitBtn = document.getElementById('submit-query');
  const responseDiv = document.getElementById('llm-response');
  const responseContent = responseDiv.querySelector('.response-content');
  
  const query = input.value.trim();
  if (!query) return;
  
  // Show loading state
  submitBtn.textContent = 'Processing...';
  submitBtn.disabled = true;
  responseDiv.style.display = 'block';
  responseContent.innerHTML = '<div class="loading">🤔 Thinking...</div>';
  
  try {
    // Simulate API call delay
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    // Try to get CV-aware response first, fallback to mock
    let response = await generateCVAwareResponse(query);
    let isRealResponse = false;
    if (!response) {
      response = generateMockResponse(query);
      console.log('Career Catalyst: Using fallback mock response');
    } else {
      console.log('Career Catalyst: Using CV-aware response');
      isRealResponse = true;
    }
    
    // Display successful response with appropriate metadata
    const metadata = isRealResponse 
      ? '<small>✅ CV-aware response from Claude 3.5 Sonnet</small>'
      : '<small>⚠️ Mock response (MCP server not available)</small>';
    
    responseContent.innerHTML = `
      <div class="api-metadata">
        ${metadata}
      </div>
      <div class="response-text">${response}</div>
    `;
    
    console.log('Career Catalyst: Mock LLM API call successful');
    
  } catch (error) {
    // Display error state
    responseContent.innerHTML = `
      <div class="error-message">
        <span class="status-indicator error">✗</span>
        <strong>Error:</strong> Failed to connect to AI service
      </div>
    `;
    console.error('Career Catalyst: LLM API call failed', error);
  }
  
  // Reset button state
  submitBtn.textContent = 'Submit';
  submitBtn.disabled = false;
}

// Generate mock AI response based on input
function generateMockResponse(query) {
  const responses = {
    job: "This appears to be a job posting for a software engineering role. Key requirements include experience with JavaScript, React, and Node.js. The company offers competitive compensation and remote work options.",
    salary: "Based on the job description, this role likely offers a salary range of $90k-$140k annually, depending on experience level and location.",
    company: "This company appears to be a mid-stage startup in the fintech space. They have strong growth metrics and recent Series B funding.",
    interview: "For this role, expect technical interviews covering algorithms, system design, and behavioral questions. I'd recommend preparing examples of your React projects and distributed systems experience.",
    default: "I can help you analyze job postings, salary ranges, company research, and interview preparation. Feel free to ask specific questions about the current page or career advice!"
  };
  
  const lowerQuery = query.toLowerCase();
  for (const [key, response] of Object.entries(responses)) {
    if (lowerQuery.includes(key)) {
      return response;
    }
  }
  
  return responses.default;
}

// TEAL INTEGRATION COMMENTED OUT - Don't remove, just disabled
/*
// Handle Teal tracking functionality
async function handleTealTracking() {
  const trackBtn = document.getElementById('track-in-teal');
  const statusDiv = document.getElementById('teal-status');
  
  // Show loading state
  trackBtn.textContent = 'Extracting...';
  trackBtn.disabled = true;
  statusDiv.style.display = 'block';
  statusDiv.innerHTML = '<div class="loading">🚀 Extracting job data...</div>';
  statusDiv.className = 'teal-status loading';
  
  try {
    // First, extract job data server-side to get normalized JSON
    statusDiv.innerHTML = '<div class="loading">🚀 Extracting job data from page...</div>';
    
    const extractResponse = await chrome.runtime.sendMessage({
      action: 'extractJob',
      url: window.location.href
    });
    
    if (!extractResponse.success) {
      throw new Error(extractResponse.error || 'Failed to extract job data');
    }
    
    // Update status to show we're opening Teal
    statusDiv.innerHTML = '<div class="loading">🔖 Opening Teal and filling form...</div>';
    trackBtn.textContent = 'Opening...';
    
    // Use the extracted job data for Teal form filling, with fallback to form fields
    const jobInfo = extractResponse.jobData || {
      title: document.getElementById('job-title')?.value || 'Unknown Title',
      company: document.getElementById('company-name')?.value || 'Unknown Company',
      location: document.getElementById('job-location')?.value || 'Unknown Location',
      url: document.getElementById('job-url')?.value || window.location.href,
      description: document.getElementById('job-description')?.value || 'No description available',
      minSalary: document.getElementById('min-salary')?.value || '',
      maxSalary: document.getElementById('max-salary')?.value || ''
    };
    
    // Send extracted job info to background script to handle the new tab and automation
    const response = await chrome.runtime.sendMessage({
      action: 'openTealAndFill',
      jobInfo: jobInfo
    });
    
    if (response.success) {
      // Show success message
      statusDiv.innerHTML = `
        <div class="success-message">
          <span class="status-indicator success">✓</span>
          <strong>Success!</strong> Job extracted and Teal opened
          <br><small>Job ID: ${extractResponse.jobId}</small>
          <br><small>Form being auto-filled in new tab</small>
        </div>
      `;
      statusDiv.className = 'teal-status success';
    } else {
      statusDiv.innerHTML = `
        <div class="error-message">
          <span class="status-indicator error">✗</span>
          <strong>Error:</strong> ${response.error || 'Failed to open Teal'}
        </div>
      `;
      statusDiv.className = 'teal-status error';
    }
    
  } catch (error) {
    statusDiv.innerHTML = `
      <div class="error-message">
        <span class="status-indicator error">✗</span>
        <strong>Error:</strong> ${error.message}
        <br><small>Failed to extract job or open Teal</small>
      </div>
    `;
    statusDiv.className = 'teal-status error';
    console.error('Career Catalyst: Teal tracking failed', error);
  }
  
  // Reset button state
  trackBtn.textContent = 'Extract & Track';
  trackBtn.disabled = false;
  
  // Hide status after 8 seconds if successful (longer to show job ID)
  if (statusDiv.className.includes('success')) {
    setTimeout(() => {
      statusDiv.style.display = 'none';
    }, 8000);
  }
}
*/

// Handle tracking job using form field values
async function handleTrackFromForm() {
  const trackBtn = document.getElementById('track-job-info');
  
  // Show loading state
  trackBtn.textContent = 'Processing...';
  trackBtn.disabled = true;
  
  try {
    // Get values directly from form fields
    const jobInfo = {
      title: document.getElementById('job-title')?.value?.trim() || '',
      company: document.getElementById('company-name')?.value?.trim() || '',
      location: document.getElementById('job-location')?.value?.trim() || '',
      url: document.getElementById('job-url')?.value?.trim() || window.location.href,
      description: document.getElementById('job-description')?.value?.trim() || '',
      minSalary: document.getElementById('min-salary')?.value?.trim() || '',
      maxSalary: document.getElementById('max-salary')?.value?.trim() || ''
    };
    
    // Validate that we have at least title and company
    if (!jobInfo.title) {
      alert('Please enter a job title before tracking');
      return;
    }
    
    if (!jobInfo.company) {
      alert('Please enter a company name before tracking');
      return;
    }
    
    // Get priority for reminder creation
    const reminderPriority = parseInt(document.getElementById('reminder-priority')?.value) || 5;

    // Get selected reminders
    const selectedReminders = [];
    if (document.getElementById('reminder-track')?.checked) selectedReminders.push('track');
    if (document.getElementById('reminder-apply')?.checked) selectedReminders.push('apply');
    if (document.getElementById('reminder-ping')?.checked) selectedReminders.push('ping');
    if (document.getElementById('reminder-prep')?.checked) selectedReminders.push('prep');
    if (document.getElementById('reminder-followup')?.checked) selectedReminders.push('followup');

    console.log('Career Catalyst: Tracking job from form fields:', jobInfo);
    console.log('Career Catalyst: Reminder priority:', reminderPriority);
    console.log('Career Catalyst: Selected reminders:', selectedReminders);

    // Send JSON payload to extract functionality server-side
    const extractResponse = await chrome.runtime.sendMessage({
      action: 'extractFromJson',
      jobData: jobInfo,
      reminderPriority: reminderPriority,
      selectedReminders: selectedReminders
    });
    
    if (extractResponse.success) {
      console.log('✅ Successfully saved job data server-side:', extractResponse.jobId);

      // Store job ID in the form field for blurb generation
      if (extractResponse.jobId) {
        const jobIdField = document.getElementById('job-id');
        if (jobIdField) {
          jobIdField.value = extractResponse.jobId;
          console.log('💾 Stored job ID in form field:', extractResponse.jobId);
        }
      }

      // TEAL INTEGRATION COMMENTED OUT - Don't remove, just disabled
      /*
      // Conditionally open Teal tab based on checkbox state
      if (shouldTrackInTeal) {
        trackBtn.textContent = 'Opening Teal...';
        const tealResponse = await chrome.runtime.sendMessage({
          action: 'openTealAndFill',
          jobInfo: jobInfo
        });

        if (tealResponse.success) {
          console.log('✅ Successfully opened Teal tab with job information');
        } else {
          console.error('❌ Failed to open Teal:', tealResponse.error);
          alert(`Failed to open Teal: ${tealResponse.error}`);
        }
      } else {
        console.log('📝 Job data saved successfully (Teal tracking disabled)');
        alert('Job data saved successfully!');
      }
      */

      console.log('📝 Job data and reminder saved successfully!');
      alert('Job data and reminder saved successfully!');

      // Update the scoring, resume, and blurb sections after successful tracking
      await updateScoringSection(extractResponse.jobId);
      await updateResumeSection(extractResponse.jobId);

      // Auto-generate résumé if Apply reminder is checked
      if (selectedReminders.includes('apply')) {
        console.log('Career Catalyst: Apply reminder checked — auto-generating résumé');
        await handleGenerateResume();
      }

      await updateBlurbSection(extractResponse.jobId, 'third');
      await updateBlurbSection(extractResponse.jobId, 'first');
    } else {
      console.error('❌ Failed to save job data:', extractResponse.error);
      alert(`Failed to save job data: ${extractResponse.error}`);
    }
    
  } catch (error) {
    console.error('Career Catalyst: Track from form failed', error);
    alert(`Error: ${error.message}`);
  } finally {
    // Reset button state
    trackBtn.textContent = 'Track';
    trackBtn.disabled = false;
  }
}

// Handle view report functionality
async function handleViewReport() {
  const reportBtn = document.getElementById('view-report');
  const jobIdField = document.getElementById('job-id');
  const jobId = jobIdField?.value?.trim();

  if (!jobId) {
    alert('No Job ID found. Please track a job first.');
    return;
  }

  // Show loading state
  reportBtn.textContent = '⏳ Loading report...';
  reportBtn.disabled = true;

  try {
    // Open the report in a new tab
    const reportUrl = `http://localhost:3000/report/${jobId}`;
    window.open(reportUrl, '_blank');

    console.log(`Opened scoring report for job ${jobId}`);
  } catch (error) {
    console.error('Error opening report:', error);
    alert(`Error opening report: ${error.message}`);
  } finally {
    // Reset button state
    reportBtn.textContent = '📊 View Report';
    reportBtn.disabled = false;
  }
}

// Check if scoring report exists for a job
async function checkScoringReportExists(jobId) {
  console.log(`[checkScoringReportExists v2] Called with jobId: ${jobId}`);
  if (!jobId) {
    console.log('[checkScoringReportExists v2] No jobId provided, returning false');
    return false;
  }

  try {
    const url = `http://localhost:3000/report/${jobId}`;
    console.log(`[checkScoringReportExists v2] Fetching: ${url}`);

    const response = await fetch(url);
    console.log(`[checkScoringReportExists v2] Response received:`, {
      status: response.status,
      ok: response.ok,
      statusText: response.statusText,
      type: response.type,
      url: response.url
    });

    const exists = response.ok;
    console.log(`[checkScoringReportExists v2] Returning: ${exists}`);
    return exists;
  } catch (error) {
    console.error('[checkScoringReportExists v2] Error:', error);
    console.error('[checkScoringReportExists v2] Error details:', {
      message: error.message,
      stack: error.stack,
      name: error.name
    });
    return false;
  }
}

// Update scoring section UI based on job ID and report existence
async function updateScoringSection(jobId) {
  console.log('[updateScoringSection v2] Called with jobId:', jobId);
  const statusText = document.getElementById('scoring-status-text');
  const statusDiv = document.getElementById('scoring-status');
  const generateBtn = document.getElementById('generate-score');
  const viewBtn = document.getElementById('view-report');

  if (!jobId) {
    console.log('[updateScoringSection v2] No job ID provided');
    statusText.textContent = 'Track a job to generate scoring report';
    statusDiv.style.background = '#f3f4f6';
    statusDiv.style.color = '#6b7280';
    generateBtn.style.display = 'none';
    viewBtn.style.display = 'none';
    return;
  }

  console.log(`[updateScoringSection v2] Checking report for job ${jobId}`);
  // Check if report exists
  statusText.textContent = '⏳ Checking for existing report...';
  console.log('[updateScoringSection v2] About to call checkScoringReportExists');
  const reportExists = await checkScoringReportExists(jobId);
  console.log(`[updateScoringSection v2] Report exists = ${reportExists}`);

  if (reportExists) {
    statusText.textContent = '✅ Scoring report available';
    statusDiv.style.background = '#d1fae5';
    statusDiv.style.color = '#065f46';
    generateBtn.style.display = 'block';
    generateBtn.textContent = '🔄 Regenerate Score';
    viewBtn.style.display = 'block';
  } else {
    statusText.textContent = '⚠️ No scoring report found';
    statusDiv.style.background = '#fef3c7';
    statusDiv.style.color = '#92400e';
    generateBtn.style.display = 'block';
    generateBtn.textContent = '✨ Generate Score';
    viewBtn.style.display = 'none';
  }
}

// Handle generate score functionality
async function handleGenerateScore() {
  const generateBtn = document.getElementById('generate-score');
  const jobIdField = document.getElementById('job-id');
  const jobId = jobIdField?.value?.trim();

  if (!jobId) {
    alert('No Job ID found. Please track a job first.');
    return;
  }

  // Show loading state
  const originalText = generateBtn.textContent;
  generateBtn.textContent = '⏳ Generating score...';
  generateBtn.disabled = true;

  try {
    // Call the backend to generate score
    const response = await chrome.runtime.sendMessage({
      action: 'generateScore',
      jobId: jobId
    });

    if (response.success) {
      console.log('✅ Score generated successfully');
      // Update the scoring section to show the new report
      await updateScoringSection(jobId);
    } else {
      throw new Error(response.error || 'Failed to generate score');
    }
  } catch (error) {
    console.error('Error generating score:', error);
    alert(`Error generating score: ${error.message}`);
    generateBtn.textContent = originalText;
    generateBtn.disabled = false;
  }
}

// Check if resume exists for a job
async function checkResumeExists(jobId) {
  try {
    const response = await chrome.runtime.sendMessage({
      action: 'checkResume',
      jobId: jobId
    });
    return {
      exists: response.exists,
      resumePath: response.resumePath,
      driveUrl: response.driveUrl
    };
  } catch (error) {
    console.error('Error checking resume:', error);
    return {
      exists: false,
      resumePath: null,
      driveUrl: null
    };
  }
}

// Update resume section UI based on job ID
async function updateResumeSection(jobId) {
  console.log('[updateResumeSection] Called with jobId:', jobId);
  const statusText = document.getElementById('resume-status-text');
  const statusDiv = document.getElementById('resume-status');
  const urlDisplay = document.getElementById('resume-url-display');
  const resumeLink = document.getElementById('resume-link');
  const generateBtn = document.getElementById('generate-resume-btn');
  const driveSection = document.getElementById('resume-drive-section');
  const driveDisplay = document.getElementById('resume-drive-display');
  const driveLink = document.getElementById('resume-drive-link');
  const driveUrlInput = document.getElementById('resume-drive-url');

  if (!jobId) {
    console.log('[updateResumeSection] No job ID provided');
    statusText.textContent = 'Track a job to check for resume';
    statusDiv.style.display = 'block';
    urlDisplay.style.display = 'none';
    generateBtn.style.display = 'none';
    driveSection.style.display = 'none';
    driveDisplay.style.display = 'none';
    return;
  }

  console.log(`[updateResumeSection] Checking resume for job ${jobId}`);
  statusText.textContent = '⏳ Checking for resume...';
  statusDiv.style.display = 'block';

  const resumeData = await checkResumeExists(jobId);
  console.log(`[updateResumeSection] Resume data =`, resumeData);

  // Handle local resume display
  if (resumeData.exists) {
    // Resume exists - show local link
    statusDiv.style.display = 'none';
    urlDisplay.style.display = 'block';
    generateBtn.style.display = 'none';

    // Set the local resume link
    const fullPath = `file:///Users/inkredabull/Code/inkredabull/career-catalyst/${resumeData.resumePath}`;
    resumeLink.href = fullPath;
  } else {
    // No resume - show generate button
    statusDiv.style.display = 'none';
    urlDisplay.style.display = 'none';
    generateBtn.style.display = 'block';
  }

  // Handle Google Drive section (independent of local resume)
  if (resumeData.driveUrl) {
    // Drive URL exists - show link
    console.log(`[updateResumeSection] Showing Drive URL: ${resumeData.driveUrl}`);
    driveSection.style.display = 'none';
    driveDisplay.style.display = 'block';
    driveLink.href = resumeData.driveUrl;
    driveLink.textContent = 'Open Resume on Google Drive';
  } else {
    // No Drive URL - show input
    console.log('[updateResumeSection] No Drive URL, showing input');
    driveSection.style.display = 'block';
    driveDisplay.style.display = 'none';
    driveUrlInput.value = '';
  }
}

// Handle generate resume functionality
async function handleGenerateResume() {
  const generateBtn = document.getElementById('generate-resume-btn');
  const jobIdField = document.getElementById('job-id');
  const jobId = jobIdField?.value?.trim();

  if (!jobId) {
    alert('No Job ID found. Please track a job first.');
    return;
  }

  // Show loading state
  generateBtn.textContent = '⏳ Generating resume...';
  generateBtn.disabled = true;

  try {
    // Call the backend to generate resume
    const response = await chrome.runtime.sendMessage({
      action: 'generateResume',
      jobId: jobId
    });

    if (response.success) {
      console.log('✅ Resume generated successfully');
      alert('Resume generated successfully!');
      // Update the resume section to show the new resume
      await updateResumeSection(jobId);
    } else {
      throw new Error(response.error || 'Failed to generate resume');
    }
  } catch (error) {
    console.error('Error generating resume:', error);
    alert(`Error generating resume: ${error.message}`);
    generateBtn.textContent = 'Generate Tailored Resume';
    generateBtn.disabled = false;
  }
}

// Parse Google Drive FILE_ID from various URL formats
function parseGoogleDriveFileId(url) {
  try {
    // Handle format: https://drive.google.com/open?id=FILE_ID&usp=...
    if (url.includes('/open?id=')) {
      const match = url.match(/[?&]id=([^&]+)/);
      if (match) return match[1];
    }

    // Handle format: https://drive.google.com/file/d/FILE_ID/view
    // Also handles /edit, /preview, etc.
    if (url.includes('/file/d/')) {
      const match = url.match(/\/file\/d\/([^/]+)/);
      if (match) return match[1];
    }

    return null;
  } catch (error) {
    console.error('Error parsing Google Drive URL:', error);
    return null;
  }
}

// Handle saving Google Drive resume URL
async function handleSaveResumeDriveUrl() {
  const jobIdField = document.getElementById('job-id');
  const jobId = jobIdField?.value?.trim();
  const driveUrlInput = document.getElementById('resume-drive-url');
  const driveUrl = driveUrlInput?.value?.trim();

  if (!jobId) {
    alert('No Job ID found. Please track a job first.');
    return;
  }

  if (!driveUrl) {
    alert('Please enter a Google Drive URL.');
    return;
  }

  // Validate it's a Google Drive URL
  if (!driveUrl.includes('drive.google.com')) {
    alert('Please enter a valid Google Drive URL.');
    return;
  }

  // Extract FILE_ID and convert to standard format
  const fileId = parseGoogleDriveFileId(driveUrl);
  if (!fileId) {
    alert('Could not parse Google Drive file ID from URL. Please check the URL format.');
    return;
  }

  // Convert to standard format
  const standardUrl = `https://drive.google.com/file/d/${fileId}/view`;
  console.log(`[handleSaveResumeDriveUrl] Parsed FILE_ID: ${fileId}`);
  console.log(`[handleSaveResumeDriveUrl] Standard URL: ${standardUrl}`);

  try {
    const response = await chrome.runtime.sendMessage({
      action: 'saveResumeDriveUrl',
      jobId: jobId,
      driveUrl: standardUrl
    });

    if (response.success) {
      console.log('✅ Google Drive URL saved successfully');
      // Update the resume section to show the saved URL
      await updateResumeSection(jobId);
    } else {
      throw new Error(response.error || 'Failed to save Google Drive URL');
    }
  } catch (error) {
    console.error('Error saving Google Drive URL:', error);
    alert(`Error saving URL: ${error.message}`);
  }
}

// Handle editing Google Drive resume URL
function handleEditResumeDriveUrl() {
  const driveDisplay = document.getElementById('resume-drive-display');
  const driveSection = document.getElementById('resume-drive-section');
  const driveLink = document.getElementById('resume-drive-link');
  const driveUrlInput = document.getElementById('resume-drive-url');

  // Hide display, show input
  driveDisplay.style.display = 'none';
  driveSection.style.display = 'block';

  // Pre-fill with current URL
  driveUrlInput.value = driveLink.href;
}

// Handle generate blurb functionality
async function handleGenerateBlurb(person) {
  const blurbBtn = document.getElementById(`generate-${person}-person-blurb`);
  const blurbDisplay = document.getElementById(`${person}-person-blurb-display`);
  const blurbContent = document.getElementById(`${person}-person-blurb-content`);
  const blurbStatus = document.getElementById(`${person}-person-blurb-status`);

  // Show loading state
  blurbBtn.textContent = '⏳ Generating blurb...';
  blurbBtn.disabled = true;

  try {
    // Get the job ID from the form field
    const jobIdField = document.getElementById('job-id');
    const jobId = jobIdField?.value?.trim();

    if (!jobId) {
      alert('No Job ID found. Please track a job first or enter a Job ID manually.');
      return;
    }

    // Get the company website URL from the form field (optional)
    const companyWebsiteField = document.getElementById('company-website');
    const companyWebsite = companyWebsiteField?.value?.trim() || '';

    console.log('Career Catalyst: Generating blurb for job ID:', jobId);
    console.log('Career Catalyst: Perspective:', person);
    if (companyWebsite) {
      console.log('Career Catalyst: Using company website:', companyWebsite);
    }

    // Send message to background script to call unified server
    const response = await chrome.runtime.sendMessage({
      action: 'generateBlurb',
      jobId: jobId,
      companyWebsite: companyWebsite,
      person: person
    });

    if (response.success) {
      console.log(`✅ Successfully generated ${person}-person blurb:`, response.blurb.substring(0, 100) + '...');

      // Hide status and button, show blurb content
      blurbStatus.style.display = 'none';
      blurbBtn.style.display = 'none';
      blurbDisplay.style.display = 'block';

      // Display the blurb
      blurbContent.textContent = response.blurb;
      blurbContent.setAttribute('data-character-count', response.characterCount);

    } else {
      console.error(`❌ Failed to generate ${person}-person blurb:`, response.error);
      alert(`Failed to generate blurb: ${response.error}`);
    }

  } catch (error) {
    console.error('Career Catalyst: Generate blurb failed', error);
    alert(`Error generating blurb: ${error.message}`);
  } finally {
    // Reset button state
    blurbBtn.disabled = false;
    if (blurbBtn.textContent.includes('⏳')) {
      blurbBtn.textContent = `📝 Generate ${person === 'third' ? 'Third' : 'First'} Person Blurb`;
    }
  }
}

// Handle copy blurb to clipboard
function handleCopyBlurb(person) {
  const copyBtn = document.getElementById(`copy-${person}-person-blurb`);
  const blurbContent = document.getElementById(`${person}-person-blurb-content`);

  const text = blurbContent.textContent;
  navigator.clipboard.writeText(text);

  const originalText = copyBtn.textContent;
  copyBtn.textContent = '✓ Copied!';
  setTimeout(() => {
    copyBtn.textContent = originalText;
  }, 2000);
}

// Check if a blurb exists for a given job ID and person
async function checkBlurbExists(jobId, person) {
  try {
    const response = await chrome.runtime.sendMessage({
      action: 'checkBlurb',
      jobId: jobId,
      person: person
    });

    return response.exists ? response.blurbContent : null;
  } catch (error) {
    console.error('Error checking blurb:', error);
    return null;
  }
}

// Update blurb section UI based on job ID and person
async function updateBlurbSection(jobId, person) {
  console.log(`[updateBlurbSection] Called with jobId: ${jobId}, person: ${person}`);
  const statusText = document.getElementById(`${person}-person-blurb-status-text`);
  const statusDiv = document.getElementById(`${person}-person-blurb-status`);
  const blurbDisplay = document.getElementById(`${person}-person-blurb-display`);
  const blurbContent = document.getElementById(`${person}-person-blurb-content`);
  const generateBtn = document.getElementById(`generate-${person}-person-blurb`);

  if (!jobId) {
    console.log(`[updateBlurbSection] No job ID provided for ${person}-person`);
    statusText.textContent = 'Track a job to check for blurb';
    statusDiv.style.display = 'block';
    blurbDisplay.style.display = 'none';
    generateBtn.style.display = 'none';
    return;
  }

  console.log(`[updateBlurbSection] Checking ${person}-person blurb for job ${jobId}`);
  statusText.textContent = '⏳ Checking for blurb...';
  statusDiv.style.display = 'block';

  const blurbText = await checkBlurbExists(jobId, person);
  console.log(`[updateBlurbSection] Blurb exists = ${blurbText ? 'yes' : 'no'}`);

  if (blurbText) {
    // Blurb exists - show content
    statusDiv.style.display = 'none';
    generateBtn.style.display = 'none';
    blurbDisplay.style.display = 'block';
    blurbContent.textContent = blurbText;
  } else {
    // No blurb - show generate button
    statusDiv.style.display = 'none';
    blurbDisplay.style.display = 'none';
    generateBtn.style.display = 'block';
  }
}

// Update connections section based on company name
function updateConnectionsSection(companyName) {
  const statusIcon = document.getElementById('connections-status-icon');
  const searchBtn = document.getElementById('search-connections');

  if (!companyName || companyName.length === 0) {
    statusIcon.textContent = '⚪';
    statusIcon.title = 'Enter company name to search connections';
    statusIcon.className = 'status-icon';
    searchBtn.disabled = true;
    return;
  }

  statusIcon.textContent = '🟢';
  statusIcon.title = `Ready to search for connections at ${companyName}`;
  statusIcon.className = 'status-icon ready';
  searchBtn.disabled = false;
}

// Handle LinkedIn connections search
async function handleSearchConnections() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('Career Catalyst: Initiating LinkedIn connections search');

  const companyNameField = document.getElementById('company-name');
  const companyName = companyNameField ? companyNameField.value.trim() : '';

  console.log('  → Company name:', companyName);

  if (!companyName) {
    alert('Please enter a company name first');
    return;
  }

  const statusIcon = document.getElementById('connections-status-icon');
  const searchBtn = document.getElementById('search-connections');

  try {
    // Show loading state
    searchBtn.disabled = true;
    searchBtn.textContent = '⏳ Looking up company...';
    statusIcon.textContent = '🟡';
    statusIcon.title = 'Searching for company on LinkedIn...';
    statusIcon.className = 'status-icon loading';

    console.log('  → Calling background script to look up LinkedIn company ID');

    // Call background script to look up the company's LinkedIn ID
    const response = await chrome.runtime.sendMessage({
      action: 'lookupLinkedInCompany',
      companyName: companyName
    });

    console.log('  → Background script response:', response);

    if (response && response.success && response.companyId) {
      const linkedInUrl = `https://www.linkedin.com/company/${response.companyId}/people/?facetNetwork=S%2CF`;

      console.log('  → LinkedIn URL generated:', linkedInUrl);
      console.log('  → Opening in new tab');

      // Open LinkedIn in a new tab
      window.open(linkedInUrl, '_blank');

      statusIcon.textContent = '✅';
      statusIcon.title = `Opened LinkedIn connections for ${companyName}`;
      statusIcon.className = 'status-icon success';

      // Reset button
      searchBtn.textContent = '🔍 Search LinkedIn Connections';
      searchBtn.disabled = false;

      // Reset status after 3 seconds
      setTimeout(() => {
        statusIcon.textContent = '🟢';
        statusIcon.title = `Ready to search for connections at ${companyName}`;
        statusIcon.className = 'status-icon ready';
      }, 3000);

    } else {
      const errorMsg = response.error || 'Could not find company on LinkedIn';
      console.log('  → Error:', errorMsg);

      statusIcon.textContent = '❌';
      statusIcon.title = errorMsg;
      statusIcon.className = 'status-icon error';

      searchBtn.textContent = '🔍 Search LinkedIn Connections';
      searchBtn.disabled = false;

      // Reset after 5 seconds
      setTimeout(() => {
        statusIcon.textContent = '🟢';
        statusIcon.title = `Ready to search for connections at ${companyName}`;
        statusIcon.className = 'status-icon ready';
      }, 5000);
    }

    console.log('═══════════════════════════════════════════════════════════');

  } catch (error) {
    console.error('  → LinkedIn connections search failed:', error);
    console.log('═══════════════════════════════════════════════════════════');

    statusIcon.textContent = '❌';
    statusIcon.title = `Error: ${error.message}`;
    statusIcon.className = 'status-icon error';

    searchBtn.textContent = '🔍 Search LinkedIn Connections';
    searchBtn.disabled = false;

    setTimeout(() => {
      statusIcon.textContent = '🟢';
      statusIcon.title = `Ready to search for connections at ${companyName}`;
      statusIcon.className = 'status-icon ready';
    }, 5000);
  }
}

// Handle extract job functionality
async function handleExtractJob() {
  const extractBtn = document.getElementById('extract-job');
  const statusDiv = document.getElementById('extract-status');

  // Show loading state
  extractBtn.textContent = 'Extracting...';
  extractBtn.disabled = true;
  statusDiv.style.display = 'block';
  statusDiv.innerHTML = '<div class="loading">🚀 Running extraction...</div>';
  statusDiv.className = 'extract-status loading';

  try {
    // Get the full page HTML for robust extraction
    const pageHtml = document.documentElement.outerHTML;
    console.log('Career Catalyst: Sending page HTML for robust extraction');
    console.log('Career Catalyst: HTML size:', pageHtml.length, 'chars');

    // Send message to background script to execute CLI command with HTML
    const response = await chrome.runtime.sendMessage({
      action: 'extractJob',
      url: window.location.href,
      html: pageHtml  // Send full HTML for robust extraction
    });
    
    if (response.success) {
      statusDiv.innerHTML = `
        <div class="success-message">
          <span class="status-indicator success">✓</span>
          <strong>Success!</strong> Job extracted successfully
          <br><small>Job ID: ${response.jobId}</small>
          <br><small>Saved to: ${response.filePath}</small>
        </div>
      `;
      statusDiv.className = 'extract-status success';
      
      // Update the job description textarea if data is available
      if (response.jobData && response.jobData.description) {
        const textarea = document.getElementById('job-description');
        textarea.value = response.jobData.description;
        extractedJobDescription = response.jobData.description;
      }
      
    } else {
      statusDiv.innerHTML = `
        <div class="error-message">
          <span class="status-indicator error">✗</span>
          <strong>Error:</strong> ${response.error || 'Extraction failed'}
        </div>
      `;
      statusDiv.className = 'extract-status error';
    }
    
  } catch (error) {
    statusDiv.innerHTML = `
      <div class="error-message">
        <span class="status-indicator error">✗</span>
        <strong>Error:</strong> Failed to execute extraction
        <br><small>${error.message}</small>
      </div>
    `;
    statusDiv.className = 'extract-status error';
    console.error('Career Catalyst: Extract job failed', error);
  }
  
  // Reset button state
  extractBtn.textContent = 'Extract';
  extractBtn.disabled = false;
  
  // Hide status after 5 seconds if successful
  if (statusDiv.className.includes('success')) {
    setTimeout(() => {
      statusDiv.style.display = 'none';
    }, 5000);
  }
}

// Analyze page content for questions
function analyzePageContent() {
  try {
    const questions = findQuestionsOnPage();
    const questionsDiv = document.getElementById('page-questions');
    const questionsList = document.getElementById('questions-list');
    
    if (questions.length > 0) {
      questionsList.innerHTML = '';
      questions.forEach(question => {
        const li = document.createElement('li');
        li.textContent = question;
        li.classList.add('clickable-question');
        li.addEventListener('click', function() {
          populateQuestionInput(question);
        });
        questionsList.appendChild(li);
      });
      questionsDiv.style.display = 'block';
      console.log(`Career Catalyst: Found ${questions.length} questions on page`);
    } else {
      questionsDiv.style.display = 'none';
      console.log('Career Catalyst: No questions found on page');
    }
  } catch (error) {
    console.error('Career Catalyst: Error analyzing page content:', error);
  }
}

// Find questions on the current page
function findQuestionsOnPage() {
  const questions = [];
  const seenQuestions = new Set();

  // Strategy 1: Look for semantic form elements (labels, legends, field descriptions)
  // This is the most reliable way to find actual application questions
  const formQuestionSelectors = [
    'label',           // Standard form labels
    'legend',          // Fieldset legends
    '[role="label"]',  // ARIA labels
    '.question',       // Common class names
    '.field-label',
    '.form-label',
    '.input-label',
    '[data-qa*="question"]',
    '[data-test*="question"]',
    '[class*="question"]',
    '[class*="field-title"]',
    '[class*="label"]'
  ];

  formQuestionSelectors.forEach(selector => {
    try {
      const elements = document.querySelectorAll(selector);
      elements.forEach(element => {
        // Skip our own extension content
        if (element.closest('#job-extractor-gutter')) return;

        // Get direct text content (not nested elements)
        let text = '';
        Array.from(element.childNodes).forEach(node => {
          if (node.nodeType === Node.TEXT_NODE) {
            text += node.textContent;
          }
        });

        // If no direct text, try the full text content but be more careful
        if (!text.trim()) {
          text = element.textContent || '';
        }

        text = text.trim();

        // Look for question-like content
        if (text && isLikelyQuestion(text) && !seenQuestions.has(text.toLowerCase())) {
          // Clean up common prefixes like "YesNo", "TrueFalse", etc.
          const cleanedText = cleanupQuestionText(text);
          if (cleanedText && cleanedText.length >= 10 && cleanedText.length < 300) {
            questions.push(cleanedText);
            seenQuestions.add(cleanedText.toLowerCase());
          }
        }
      });
    } catch (e) {
      console.log(`Error processing selector ${selector}:`, e);
    }
  });

  // Strategy 2: Look for text patterns that indicate questions
  // Only do this if we haven't found many questions yet (form-based detection is preferred)
  if (questions.length < 5) {
    const questionPatterns = [
      /^[A-Z][^.!]*\?$/,  // Complete question starting with capital, ending with ?
      /^(?:What|How|Why|When|Where|Who|Which|Can\s+you|Do\s+you|Are\s+you|Have\s+you|Would\s+you|Could\s+you|Will\s+you|Should\s+you)\s+.+\?$/gi
    ];

    // Target specific containers more likely to have questions
    const questionContainers = document.querySelectorAll('form, .application-form, .questions-section, main, article, .content');

    questionContainers.forEach(container => {
      if (container.closest('#job-extractor-gutter')) return;

      // Look at immediate text nodes and small text elements
      const smallTextElements = container.querySelectorAll('p, li, h4, h5, h6, div[class*="question"], div[class*="field"]');

      smallTextElements.forEach(element => {
        if (element.closest('#job-extractor-gutter')) return;

        const text = element.textContent?.trim() || '';

        // Only process reasonably sized text blocks
        if (text.length < 10 || text.length > 300) return;

        questionPatterns.forEach(pattern => {
          const matches = text.match(pattern);
          if (matches) {
            matches.forEach(match => {
              const cleanQuestion = cleanupQuestionText(match.trim());
              if (cleanQuestion &&
                  cleanQuestion.length >= 10 &&
                  cleanQuestion.length < 300 &&
                  !seenQuestions.has(cleanQuestion.toLowerCase()) &&
                  !isCommonNonQuestion(cleanQuestion)) {
                questions.push(cleanQuestion);
                seenQuestions.add(cleanQuestion.toLowerCase());
              }
            });
          }
        });
      });
    });
  }

  // Limit to first 15 questions
  return questions.slice(0, 15);
}

// Check if text is likely a question
function isLikelyQuestion(text) {
  if (!text || text.length < 5) return false;

  // Ends with question mark
  if (text.endsWith('?')) return true;

  // Contains question words at the start
  const questionWords = /^(what|how|why|when|where|who|which|can\s+you|do\s+you|are\s+you|have\s+you|would\s+you|could\s+you|will\s+you|should\s+you|describe|explain|tell\s+us|tell\s+me)/i;
  if (questionWords.test(text)) return true;

  // Common application question patterns (even without ?)
  const applicationPatterns = [
    /status\s*$/i,               // "H-1B status", "visa status"
    /authorized\s+to\s+work/i,
    /eligible\s+to\s+work/i,
    /require\s+sponsorship/i,
    /previously\s+worked/i,
    /years?\s+of\s+experience/i,
    /available\s+to\s+(start|work)/i,
    /willing\s+to/i,
    /consent\s+to/i,
    /complete\s+this\s+form/i
  ];

  return applicationPatterns.some(pattern => pattern.test(text));
}

// Clean up question text by removing common prefixes and formatting issues
function cleanupQuestionText(text) {
  if (!text) return '';

  // Remove common form control prefixes that get concatenated
  text = text
    .replace(/^(YesNo|TrueFalse|Yes\/No|True\/False)\s*/i, '')
    .replace(/^(Radio|Checkbox|Select|Dropdown)\s*/i, '')
    .replace(/^\*\s*/, '') // Remove required asterisks
    .replace(/\s+/g, ' ')  // Normalize whitespace
    .trim();

  return text;
}

// Filter out common patterns that aren't real questions
function isCommonNonQuestion(text) {
  const nonQuestionPatterns = [
    /^(what|how|why|when|where|who)\s*(is|are|was|were)?\s*$/i, // Too short
    /^\s*\?\s*$/,  // Just question marks
    /\d+\s*\?\s*\d+/,  // Math expressions
    /\$\d+/,  // Price questions
    /\b(faq|q&a)\b/i,  // FAQ headers
    /^(search|find|filter|sort|view|show|hide|toggle|click|select|choose)\b/i, // UI actions
    /^(home|about|contact|privacy|terms|help|support|login|logout|sign\s+in|sign\s+out)\b/i, // Navigation
    /^(next|previous|back|continue|submit|cancel|save|edit|delete)\b/i, // Form buttons
    /^(yes|no|true|false|maybe|ok|okay)\s*$/i, // Simple answers
    /\b(cookie|gdpr|consent\s+to\s+cookies)\b/i, // Cookie banners
    /^(required|optional|recommended)\s*$/i, // Field requirements
    /^\d+\s*(characters?|words?|minimum|maximum|min|max)\b/i // Character limits
  ];

  return nonQuestionPatterns.some(pattern => pattern.test(text));
}

// Populate question into input field for user review
function populateQuestionInput(question) {
  const input = document.getElementById('llm-input');
  if (input) {
    input.value = question;
    input.focus();
    console.log('Career Catalyst: Question populated into input:', question);
  }
}

// Generate CV-aware response using local MCP server
async function generateCVAwareResponse(query) {
  try {
    console.log('═══════════════════════════════════════════════════════════');
    console.log('Career Catalyst Content: Initiating CV-aware response request');
    console.log('  → Question:', query);
    console.log('  → Question length:', query.length, 'chars');

    // Get all job context fields
    const jobId = document.getElementById('job-id')?.value?.trim() || '';
    const jobTitle = document.getElementById('job-title')?.value?.trim() || '';
    const companyName = document.getElementById('company-name')?.value?.trim() || '';
    const jobLocation = document.getElementById('job-location')?.value?.trim() || '';
    const jobDescription = document.getElementById('job-description')?.value?.trim() || '';
    const companyUrl = document.getElementById('company-url')?.value?.trim() || '';

    // Build comprehensive job context
    let jobContext = '';
    if (jobTitle || companyName) {
      jobContext = `Role: ${jobTitle}${companyName ? ` at ${companyName}` : ''}`;
      if (jobLocation) jobContext += `\nLocation: ${jobLocation}`;
      if (companyUrl) jobContext += `\nCompany Website: ${companyUrl}`;
      if (jobDescription) jobContext += `\n\nJob Description:\n${jobDescription}`;
    } else if (jobDescription) {
      jobContext = jobDescription;
    }

    console.log('  → Job ID:', jobId || '(none)');
    console.log('  → Job title:', jobTitle || '(none)');
    console.log('  → Company:', companyName || '(none)');
    console.log('  → Company URL:', companyUrl || '(none)');
    console.log('  → Job description length:', jobDescription.length, 'chars');
    console.log('  → Full context length:', jobContext.length, 'chars');

    if (jobContext.length === 0) {
      console.log('  → WARNING: No job context available - response will be generic');
    }

    console.log('  → Sending message to background script');

    // Make request to local MCP server (through background script)
    const response = await chrome.runtime.sendMessage({
      action: 'callMCPServer',
      tool: 'answer_cv_question',
      args: {
        question: query,
        jobDescription: jobContext,
        jobId: jobId || null
      }
    });

    console.log('  → Background script response received');
    console.log('  → Response success:', response?.success);

    if (response && response.success && response.data) {
      console.log('  → CV-aware response length:', response.data.length, 'chars');
      console.log('  → Response preview:', response.data.substring(0, 100) + '...');
      console.log('═══════════════════════════════════════════════════════════');
      return response.data;
    }

    console.log('  → No CV-aware response available, falling back to mock');
    console.log('═══════════════════════════════════════════════════════════');
    return null;
  } catch (error) {
    console.warn('  → Failed to get CV-aware response:', error);
    console.log('═══════════════════════════════════════════════════════════');
    return null;
  }
}

// Open the gutter
function openGutter() {
  if (isGutterOpen) return;
  
  createGutter();
  
  // Animate in
  setTimeout(() => {
    gutterElement.classList.add('open');
    document.body.classList.add('job-extractor-gutter-open');
    document.documentElement.classList.add('job-extractor-gutter-open');
    isGutterOpen = true;
  }, 10);
  
  console.log('Career Catalyst: Gutter opened');
}

// Close the gutter
function closeGutter() {
  if (!isGutterOpen || !gutterElement) return;
  
  gutterElement.classList.remove('open');
  document.body.classList.remove('job-extractor-gutter-open');
  document.documentElement.classList.remove('job-extractor-gutter-open');
  
  setTimeout(() => {
    if (gutterElement && gutterElement.parentNode) {
      gutterElement.parentNode.removeChild(gutterElement);
      gutterElement = null;
    }
  }, 300);
  
  isGutterOpen = false;
  console.log('Career Catalyst: Gutter closed');
}

// Toggle gutter
function toggleGutter() {
  if (isGutterOpen) {
    closeGutter();
  } else {
    openGutter();
  }
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  switch (request.action) {
    case 'toggleGutter':
      toggleGutter();
      sendResponse({
        success: true,
        isOpen: isGutterOpen
      });
      break;
      
    case 'getGutterState':
      sendResponse({
        isOpen: isGutterOpen
      });
      break;
      
    default:
      sendResponse({success: false, error: 'Unknown action'});
  }
});

// Keyboard shortcut (Ctrl+Shift+J or Cmd+Shift+J)
document.addEventListener('keydown', function(e) {
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'J') {
    e.preventDefault();
    if (jobExtractorEnabled) {
      toggleGutter();
    } else {
      console.log('Career Catalyst Assistant is disabled. Use toggleJobExtractor(true) to enable.');
    }
  }
});

// LinkedIn connection extraction functionality
function detectLinkedInCompanyPeople() {
  const url = window.location.href;
  return url.includes('linkedin.com/company/') && url.includes('/people/');
}

function runLinkedInConnectionExtraction() {
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

  // DISABLED: Auto-opening profiles is too noisy and needs architectural refactoring
  // TODO: Move to dedicated LinkedIn networking component as separate feature
  // This functionality should be:
  // 1. Opt-in via settings/toggle
  // 2. Separate from job tracking modal
  // 3. Have its own UI panel or context menu option
  if (clickableElements.length > 0) {
      console.log(`LinkedIn networking feature disabled. Found ${clickableElements.length} profiles but not auto-opening.`);
      linkedInExtractionRunning = false;
      return;
  } else {
      console.log("No clickable connection profiles found with any selector pattern.");
      console.log("Available elements on page:");
      // Debug: log what elements are actually on the page
      var allLinks = document.querySelectorAll('a[href*="linkedin.com"], a[href*="/in/"]');
      console.log(`Found ${allLinks.length} LinkedIn-related links total`);
      linkedInExtractionRunning = false; // Reset flag if no elements found
  }
}

// Auto-detect LinkedIn company people pages and run extraction
function checkForLinkedInExtraction() {
  if (detectLinkedInCompanyPeople()) {
    // Auto-enable Career Catalyst when on LinkedIn company people page (outreach command)
    if (!jobExtractorEnabled) {
      jobExtractorEnabled = true;
      console.log('🔄 Career Catalyst Assistant automatically enabled for outreach command');
    }
    
    if (!linkedInExtractionRunning) {
      linkedInExtractionRunning = true;
      // Clear previous session's prompted profiles when starting fresh extraction
      promptedProfiles.clear();
      console.log('Cleared previous prompt tracking for fresh session');
      console.log('LinkedIn company people page detected - waiting 5 seconds before extraction...');
      function startExtraction() {
        runLinkedInConnectionExtraction();
      }
      setTimeout(startExtraction, 5000);
    }
  }
}

// NOTE: LinkedIn networking code is now in separate component
// See: components/linkedin-networking/linkedin-networking-content.js
// The following initialization is DISABLED - LinkedIn networking runs in separate content script

// Run check when page loads - DISABLED
// if (document.readyState === 'loading') {
//   document.addEventListener('DOMContentLoaded', checkForLinkedInExtraction);
// } else {
//   checkForLinkedInExtraction();
// }
// window.addEventListener('load', checkForLinkedInExtraction);
// setInterval(checkUrlChange, 1000);
// checkForLinkedInExtraction();

// LinkedIn Profile Mutual Connections Handler
function detectLinkedInProfile() {
  const url = window.location.href;
  return url.includes('linkedin.com/in/');
}

function findAndClickMutualConnections() {
  console.log('Looking for mutual connections link...');
  
  // Don't run on search results pages
  if (window.location.href.includes('/search/results/')) {
    console.log('Skipping mutual connections search - already on search results page');
    return;
  }
  
  // Get the current profile person's name from the page
  var profileName = getProfilePersonName();
  console.log(`Profile person name: "${profileName}"`);
  
  // If we're getting "Unknown Profile", let's debug what's available on the page
  if (profileName === 'Unknown Profile') {
    console.log('Profile name detection failed, debugging available elements:');
    
    // Check all h1 elements
    var allH1s = document.querySelectorAll('h1');
    console.log(`Found ${allH1s.length} h1 elements:`);
    allH1s.forEach((h1, index) => {
      console.log(`  H1 ${index}: "${h1.innerText.trim()}" (classes: ${h1.className})`);
    });
    
    // Check page title
    console.log(`Document title: "${document.title}"`);
    
    // Check for text-heading-xlarge specifically
    var headingElements = document.querySelectorAll('.text-heading-xlarge');
    console.log(`Found ${headingElements.length} .text-heading-xlarge elements:`);
    headingElements.forEach((el, index) => {
      console.log(`  Heading ${index}: "${el.innerText.trim()}"`);
    });
    
    // Check ALL elements with text that might contain names
    var allTextElements = document.querySelectorAll('h1, h2, .pv-text-details__left-panel *, .top-card *, [data-test-id*="name"] *, [data-anonymize="person-name"]');
    console.log(`Found ${allTextElements.length} potential name elements:`);
    allTextElements.forEach((el, index) => {
      var text = el.innerText ? el.innerText.trim() : '';
      if (text.length > 0 && text.length < 100) {
        console.log(`  Element ${index}: "${text}" (tag: ${el.tagName}, classes: ${el.className})`);
      }
    });
  }
  
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
      if (linkElement && linkElement.href && linkElement.href.includes('facetConnectionOf')) {
        // Double check this isn't clicking on a name within the text
        var linkText = linkElement.innerText || linkElement.textContent || '';
        if (linkText.includes('other mutual connection')) {
          mutualConnectionLink = linkElement;
          console.log(`Found mutual connections link with full text: "${linkText.trim()}"`);
          console.log(`Link href: ${linkElement.href}`);
          break;
        }
      }
    }
  }
  
  // More specific fallback: look for the exact pattern
  if (!mutualConnectionLink) {
    var allLinks = document.querySelectorAll('a[href*="facetConnectionOf"]');
    console.log(`Found ${allLinks.length} links with facetConnectionOf`);
    
    for (let link of allLinks) {
      var linkText = link.innerText || link.textContent || '';
      console.log(`Checking link: "${linkText.trim()}" -> ${link.href}`);
      
      // Make sure it contains the full mutual connections text and not just a name
      if (linkText.includes('mutual connection') && linkText.includes('other') && !link.href.includes('/in/')) {
        mutualConnectionLink = link;
        console.log(`Selected mutual connections link: "${linkText.trim()}"`);
        break;
      }
    }
  }
  
  // Final fallback: find the link that has the most complete mutual connections text
  if (!mutualConnectionLink) {
    console.log('Using final fallback to find mutual connections link...');
    var allLinks = document.querySelectorAll('a[href*="facetConnectionOf"]');
    var bestLink = null;
    var maxNames = 0;
    
    for (let link of allLinks) {
      if (!link.href.includes('/in/')) {
        var linkText = link.innerText || link.textContent || '';
        // Count how many names are in the text (commas + 1)
        var nameCount = (linkText.match(/,/g) || []).length + 1;
        if (nameCount > maxNames && linkText.includes('mutual')) {
          maxNames = nameCount;
          bestLink = link;
          console.log(`Better link found with ${nameCount} names: "${linkText.trim()}"`);
        }
      }
    }
    
    mutualConnectionLink = bestLink;
    if (mutualConnectionLink) {
      console.log(`Final selected link: "${mutualConnectionLink.innerText.trim()}"`);
    }
  }
  
  if (mutualConnectionLink) {
    console.log('Found mutual connections link, clicking...');
    console.log(`Link URL: ${mutualConnectionLink.href}`);
    
    // Check if we've already prompted for this profile
    var currentUrl = window.location.href;
    if (promptedProfiles.has(currentUrl)) {
      console.log('Already prompted for this profile, skipping confirmation');
      return;
    }
    
    // Ask user for confirmation before proceeding
    var confirmMessage = `Found mutual connections for this profile.\n\nClick OK to extract mutual connections data, or Cancel to skip.`;
    var userConfirmed = confirm(confirmMessage);
    
    // Mark this profile as prompted regardless of user choice
    promptedProfiles.add(currentUrl);
    
    if (!userConfirmed) {
      console.log('User cancelled mutual connections extraction');
      return;
    }
    
    console.log('User confirmed - proceeding with mutual connections extraction');
    
    // Store the profile person's name and URL in localStorage for persistence across page navigation
    console.log(`Storing in localStorage - URL: "${currentUrl}", Name: "${profileName}"`);
    
    // Ensure we store the actual name, not "Unknown Profile"
    var nameToStore = profileName;
    if (profileName === 'Unknown Profile') {
      // Try to extract name from URL as fallback during storage
      var urlMatch = currentUrl.match(/linkedin\.com\/in\/([^\/\?]+)/);
      if (urlMatch) {
        var urlSlug = urlMatch[1];
        nameToStore = urlSlug
          .replace(/-/g, ' ')
          .replace(/\d+/g, '')
          .trim()
          .split(' ')
          .map(word => word.charAt(0).toUpperCase() + word.slice(1))
          .join(' ');
        console.log(`Using URL-extracted name for storage: "${nameToStore}"`);
      }
    }
    
    localStorage.setItem('linkedin_target_profile_url', currentUrl);
    localStorage.setItem('linkedin_target_profile_name', nameToStore);
    localStorage.setItem('linkedin_extraction_timestamp', Date.now().toString());
    
    // Verify storage worked
    console.log(`Verification - stored name: "${localStorage.getItem('linkedin_target_profile_name')}"`);
    console.log(`Verification - stored URL: "${localStorage.getItem('linkedin_target_profile_url')}"`);
    
    mutualConnectionLink.click();
    
    // Don't set up extraction timer here - it will be handled by the URL change detection
  } else {
    console.log('No mutual connections link found on this profile');
  }
}

// Helper function to get the profile person's name from the profile page
function getProfilePersonName() {
  try {
    // Try multiple selectors for the profile name
    var nameSelectors = [
      'h1.inline.t-24.v-align-middle.break-words',  // New LinkedIn profile name selector
      'h1[class*="inline"][class*="t-24"][class*="v-align-middle"][class*="break-words"]', // Fallback for dynamic classes
      '.text-heading-xlarge',
      '.pv-text-details__left-panel h1',
      '.top-card-layout__title',
      'h1[data-anonymize="person-name"]',
      '.top-card__title',
      '.ph5 .text-heading-xlarge',
      '.pv-text-details__left-panel .text-heading-xlarge'
    ];
    
    for (let selector of nameSelectors) {
      var nameElement = document.querySelector(selector);
      if (nameElement && nameElement.innerText.trim()) {
        var name = nameElement.innerText.trim();
        console.log(`Found potential name with selector "${selector}": "${name}"`);
        // Less restrictive filtering - just avoid obvious non-names
        if (!name.toLowerCase().includes('search') && 
            !name.toLowerCase().includes('results') && 
            name.length > 2 && 
            !name.match(/^\(\d+\)/)) {
          return name;
        }
      }
    }
    
    // Fallback: try to get from page title, but clean it up
    var pageTitle = document.title;
    console.log(`Page title: "${pageTitle}"`);
    var titleMatch = pageTitle.match(/^([^|(-]+)/);
    if (titleMatch) {
      var name = titleMatch[1].trim();
      console.log(`Extracted from title: "${name}"`);
      // Less restrictive filtering
      if (!name.toLowerCase().includes('search') && 
          !name.toLowerCase().includes('results') && 
          name.length > 2) {
        return name;
      }
    }
    
    // Final fallback: extract name from URL
    var currentUrl = window.location.href;
    var urlMatch = currentUrl.match(/linkedin\.com\/in\/([^\/\?]+)/);
    if (urlMatch) {
      var urlSlug = urlMatch[1];
      // Convert URL slug to readable name
      var nameFromUrl = urlSlug
        .replace(/-/g, ' ')           // Replace hyphens with spaces
        .replace(/\d+/g, '')         // Remove numbers
        .trim()
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1)) // Capitalize each word
        .join(' ');
      
      console.log(`Extracted from URL: "${nameFromUrl}"`);
      if (nameFromUrl.length > 2) {
        return nameFromUrl;
      }
    }
    
    return 'Unknown Profile';
  } catch (error) {
    console.log('Could not determine profile person name:', error);
    return 'Unknown Profile';
  }
}

async function extractMutualConnectionNames() {
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
          .split('-')[0]                    // Get first part before hyphens
          .replace(/\d+/g, '')             // Remove any numbers
          .trim();

        if (firstName.length > 0) {
          targetFirstName = firstName.charAt(0).toUpperCase() + firstName.slice(1).toLowerCase();
        }
      }
    }

    console.log(`Extracted first name from URL: "${targetFirstName}"`);

    // Try multiple selector strategies for mutual connections
    var nameElements = [];
    var result = 'Full,PersonName,PersonURL\n'; // CSV headers

    // Debug: Wait a moment for LinkedIn's dynamic content to load
    console.log('Waiting 1 second for LinkedIn content to load...');
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Debug: Log what's available on the page
    console.log('Debug - Analyzing page structure:');
    console.log('- .reusable-search__result-container:', document.querySelectorAll('.reusable-search__result-container').length);
    console.log('- .entity-result__item:', document.querySelectorAll('.entity-result__item').length);
    console.log('- .search-results-container:', document.querySelectorAll('.search-results-container').length);
    console.log('- li.reusable-search__result-container:', document.querySelectorAll('li.reusable-search__result-container').length);
    console.log('- [data-chameleon-result-urn]:', document.querySelectorAll('[data-chameleon-result-urn]').length);
    console.log('- a[data-view-name="search-result-lockup-title"]:', document.querySelectorAll('a[data-view-name="search-result-lockup-title"]').length);
    console.log('- [data-view-name="people-search-result"]:', document.querySelectorAll('[data-view-name="people-search-result"]').length);
    console.log('- All <li> elements:', document.querySelectorAll('li').length);
    console.log('- All <a> elements with /in/:', document.querySelectorAll('a[href*="/in/"]').length);

    // Strategy 1: Try to find mutual connection links in search results
    // LinkedIn uses various class patterns, try common ones
    var selectors = [
      // 2025+ LinkedIn with obfuscated classes - use stable data attributes
      'a[data-view-name="search-result-lockup-title"]',
      '[data-view-name="people-search-result"] a[href*="/in/"]',
      // Modern LinkedIn search results (2024+) - try different variations
      'li.reusable-search__result-container .entity-result__title-text a span[aria-hidden="true"]',
      '.search-results-container .entity-result__title-text a span[aria-hidden="true"]',
      '[data-chameleon-result-urn] .entity-result__title-text a span[aria-hidden="true"]',
      '.entity-result__item .entity-result__title-text a span[aria-hidden="true"]',
      // Try without the nested span
      '.entity-result__title-text a[href*="/in/"]',
      // Older patterns
      '.t-16 a span>span:not(.visually-hidden)',
      'div.mb1 a span>span:not(.visually-hidden)',
      // Very broad fallback
      'a[href*="/in/"] span.entity-result__title-text span[aria-hidden="true"]'
    ];

    for (var selector of selectors) {
      var elements = Array.from(document.querySelectorAll(selector));
      console.log(`Trying selector "${selector}": found ${elements.length} elements`);

      if (elements.length > 0) {
        // For link elements, get the text content
        if (selector.includes('a[href')) {
          nameElements = elements.map(el => ({
            innerText: el.textContent || el.innerText || ''
          }));
        } else {
          nameElements = elements;
        }
        console.log(`✓ Using selector: ${selector} (${nameElements.length} matches)`);
        break;
      }
    }

    if (nameElements.length === 0) {
      console.log('Could not find mutual connections with any known selector');
      console.log('Dumping first search result HTML for debugging:');
      var firstResult = document.querySelector('li.reusable-search__result-container, .entity-result__item, [data-chameleon-result-urn]');
      if (firstResult) {
        console.log(firstResult.outerHTML.substring(0, 500) + '...');
      } else {
        console.log('No search results found on page');
        // Try to find ANY list items or profile links
        var anyLi = document.querySelector('li');
        var anyProfileLink = document.querySelector('a[href*="/in/"]');
        if (anyLi) {
          console.log('Found a <li> element, here\'s the HTML:', anyLi.outerHTML.substring(0, 800) + '...');
        }
        if (anyProfileLink) {
          console.log('Found a profile link, here\'s the HTML:', anyProfileLink.outerHTML.substring(0, 500) + '...');
          console.log('Parent of profile link:', anyProfileLink.parentElement?.outerHTML.substring(0, 500) + '...');
        }
      }
      return;
    }

    nameElements.forEach((element) => {
      var mutualConnectionName = element.innerText.trim();
      if (mutualConnectionName && mutualConnectionName.length > 0) {
        // Output format: mutual connection full name, target profile first name, target profile URL
        var csvRow = `"${mutualConnectionName}","${targetFirstName}","${targetProfileUrl}"`;
        result += csvRow + '\n';
      }
    });

    if (nameElements.length > 0) {
      console.log('Complete CSV output:');
      console.log(result);
      console.log(`Total mutual connections found: ${nameElements.length}`);
    }

  } catch (error) {
    console.error('Error extracting mutual connection names:', error);
  }
}

// Helper function to get the connection person's name
function getConnectionPersonName() {
  try {
    // Try to get from URL parameters first
    var urlParams = new URLSearchParams(window.location.search);
    var connectionId = urlParams.get('facetConnectionOf');
    
    // Try to get from the page breadcrumb or title
    var breadcrumbElement = document.querySelector('.search-results-container h1, .search-results__title');
    if (breadcrumbElement) {
      var titleText = breadcrumbElement.innerText;
      // Extract name from text like "People connected to John Doe"
      var nameMatch = titleText.match(/connected to (.+?)(?:\s|$)/i);
      if (nameMatch) {
        return nameMatch[1].trim();
      }
    }
    
    // Fallback: try to get from previous page context (if available)
    if (window.previousConnectionName) {
      return window.previousConnectionName;
    }
    
    return 'Unknown Connection';
  } catch (error) {
    console.log('Could not determine connection person name:', error);
    return 'Unknown Connection';
  }
}

// Auto-detect LinkedIn profile pages and find mutual connections
function checkForLinkedInProfile() {
  if (!jobExtractorEnabled) {
    return; // Skip if disabled
  }
  
  // Only run on individual profile pages, NOT on company people pages or search results pages
  var url = window.location.href;
  var isProfilePage = url.includes('linkedin.com/in/');
  var isCompanyPage = detectLinkedInCompanyPeople();
  var isSearchPage = url.includes('/search/results/');
  
  console.log(`checkForLinkedInProfile: isProfilePage=${isProfilePage}, isCompanyPage=${isCompanyPage}, isSearchPage=${isSearchPage}`);
  
  if (isProfilePage && !isCompanyPage && !isSearchPage) {
    console.log('LinkedIn profile page detected - waiting 5 seconds before looking for mutual connections...');
    searchPageProcessed = false; // Reset for new profile
    setTimeout(() => {
      findAndClickMutualConnections();
    }, 5000);
  } else if (isSearchPage && url.includes('facetConnectionOf') && !searchPageProcessed) {
    // This is a mutual connections search page - just extract the data ONCE
    console.log('LinkedIn mutual connections search page detected - waiting 4 seconds before extracting...');
    searchPageProcessed = true;
    setTimeout(() => {
      extractMutualConnectionNames();
    }, 4000);
  }
}

// Listen for messages from company people page
window.addEventListener('message', function(event) {
  if (event.data.action === 'detectMutualConnections') {
    console.log(`Received request to detect mutual connections for: ${event.data.profileName}`);
    checkForLinkedInProfile();
  }
});

// NOTE: LinkedIn profile checking is now in separate component
// See: components/linkedin-networking/linkedin-networking-content.js
// The following initialization is DISABLED

// if (document.readyState === 'loading') {
//   document.addEventListener('DOMContentLoaded', checkForLinkedInProfile);
// } else {
//   checkForLinkedInProfile();
// }
// window.addEventListener('load', checkForLinkedInProfile);


// LinkedIn Feed Post Save Detection
function detectLinkedInFeed() {
  const url = window.location.href;
  const isLinkedInFeed = url.includes('linkedin.com/feed');
  console.log('LinkedIn Feed: URL check:', { url, isLinkedInFeed });
  return isLinkedInFeed;
}

function initLinkedInFeedMonitoring() {
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

// Network interception is now handled by the injected script (linkedin-inject.js)
// This function is kept for compatibility but is no longer used

// Helper functions for extracting activity URN (used by fallback methods)
function extractActivityUrnFromSaveUrl(url) {
  try {
    // URL format: /voyagerFeedDashSaveStates/urn%3Ali%3Afsd_saveState%3A(SAVE%2Curn%3Ali%3Aactivity%3A7379230453674942464)
    const match = url.match(/urn%3Ali%3Aactivity%3A(\d+)/);
    if (match && match[1]) {
      return match[1];
    }
    
    // Try without URL encoding
    const match2 = url.match(/urn:li:activity:(\d+)/);
    if (match2 && match2[1]) {
      return match2[1];
    }
    
    return null;
  } catch (error) {
    console.error('LinkedIn Feed: Error extracting activity URN:', error);
    return null;
  }
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
      
      // Fallback: try to find any recently saved post
      const recentlySavedPost = findRecentlySavedPost();
      if (recentlySavedPost) {
        console.log('LinkedIn Feed: Using fallback - found recently saved post');
        extractAndCreateReminderFromPost(recentlySavedPost);
      }
    }
  } catch (error) {
    console.error('LinkedIn Feed: Error processing saved post:', error);
  }
}

function findPostByActivityUrn(activityUrn) {
  // Try different selectors that might contain the activity URN
  const selectors = [
    `[data-urn*="activity:${activityUrn}"]`,
    `[data-urn*="${activityUrn}"]`,
    `[data-activity-urn*="${activityUrn}"]`,
    `[data-id*="${activityUrn}"]`
  ];
  
  for (const selector of selectors) {
    const element = document.querySelector(selector);
    if (element) {
      console.log('LinkedIn Feed: Found post by selector:', selector);
      return element;
    }
  }
  
  // Try to find by looking at all post elements and checking their data attributes
  const allPosts = document.querySelectorAll('.feed-shared-update-v2, .occludable-update, [data-urn*="activity"]');
  for (const post of allPosts) {
    const urnData = post.getAttribute('data-urn') || '';
    if (urnData.includes(activityUrn)) {
      console.log('LinkedIn Feed: Found post by data-urn attribute');
      return post;
    }
  }
  
  return null;
}

function findRecentlySavedPost() {
  // Look for posts with saved state indicators
  const savedIndicators = [
    '[aria-pressed="true"]',
    '.saved',
    '[data-control-name*="save"][aria-pressed="true"]'
  ];
  
  for (const selector of savedIndicators) {
    const savedButton = document.querySelector(selector);
    if (savedButton) {
      const postElement = findPostElement(savedButton);
      if (postElement) {
        return postElement;
      }
    }
  }
  
  return null;
}

// Old DOM-based detection methods - keeping for reference and fallback
// Now using network request monitoring instead

function findPostElement(saveButton) {
  // LinkedIn posts are typically in containers with these selectors
  const postSelectors = [
    '.feed-shared-update-v2',
    '.occludable-update',
    '[data-urn*="activity"]',
    '.feed-shared-update'
  ];
  
  for (const selector of postSelectors) {
    const postElement = saveButton.closest(selector);
    if (postElement) {
      return postElement;
    }
  }
  
  return null;
}

async function extractAndCreateReminderFromPost(postElement) {
  try {
    console.log('LinkedIn Feed: Extracting post information...');
    
    const postInfo = extractLinkedInPostInfo(postElement);
    
    if (postInfo.author && postInfo.content) {
      console.log('LinkedIn Feed: Creating reminder for saved post...', postInfo);
      
      // Create reminder via background script
      const response = await chrome.runtime.sendMessage({
        action: 'createLinkedInPostReminder',
        postInfo: postInfo
      });
      
      if (response && response.success) {
        console.log('LinkedIn Feed: ✅ Reminder created successfully!');
        showLinkedInFeedNotification('📌 Reminder created for saved post');
      } else {
        console.log('LinkedIn Feed: ❌ Failed to create reminder:', response?.error);
      }
    } else {
      console.log('LinkedIn Feed: ⚠️ Could not extract enough post information');
    }
  } catch (error) {
    console.error('LinkedIn Feed: Error creating reminder:', error);
  }
}

function extractLinkedInPostInfo(postElement) {
  const postInfo = {
    author: '',
    title: '',
    content: '',
    url: window.location.href,
    timestamp: new Date().toISOString(),
    postId: ''
  };
  
  try {
    // Extract author name
    const authorSelectors = [
      '.feed-shared-actor__name',
      '.feed-shared-actor__title',
      '.update-components-actor__name',
      '[data-urn*="person"] span[aria-hidden="true"]'
    ];
    
    for (const selector of authorSelectors) {
      const authorElement = postElement.querySelector(selector);
      if (authorElement && authorElement.textContent.trim()) {
        postInfo.author = authorElement.textContent.trim();
        break;
      }
    }
    
    // Extract post content
    const contentSelectors = [
      '.feed-shared-text',
      '.feed-shared-inline-show-more-text',
      '.update-components-text',
      '.feed-shared-update-v2__description'
    ];
    
    for (const selector of contentSelectors) {
      const contentElement = postElement.querySelector(selector);
      if (contentElement && contentElement.textContent.trim()) {
        postInfo.content = contentElement.textContent.trim().substring(0, 500); // Limit length
        break;
      }
    }
    
    // Extract post ID from data attributes
    const urnElement = postElement.querySelector('[data-urn]') || postElement;
    if (urnElement.dataset.urn) {
      postInfo.postId = urnElement.dataset.urn;
    }
    
    // Create a title from author and content preview
    if (postInfo.author && postInfo.content) {
      const contentPreview = postInfo.content.substring(0, 50) + (postInfo.content.length > 50 ? '...' : '');
      postInfo.title = `LinkedIn post by ${postInfo.author}: ${contentPreview}`;
    } else if (postInfo.author) {
      postInfo.title = `LinkedIn post by ${postInfo.author}`;
    }
    
    console.log('LinkedIn Feed: Extracted post info:', postInfo);
    return postInfo;
    
  } catch (error) {
    console.error('LinkedIn Feed: Error extracting post info:', error);
    return postInfo;
  }
}

function showLinkedInFeedNotification(message) {
  // Create a temporary notification element
  const notification = document.createElement('div');
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: #0a66c2;
    color: white;
    padding: 10px 20px;
    border-radius: 8px;
    box-shadow: 0 4px 8px rgba(0,0,0,0.3);
    z-index: 10000;
    font-size: 14px;
    max-width: 300px;
  `;
  notification.textContent = message;
  
  document.body.appendChild(notification);
  
  // Remove after 3 seconds
  setTimeout(() => {
    if (notification.parentNode) {
      notification.parentNode.removeChild(notification);
    }
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

// NOTE: LinkedIn feed monitoring is now in separate component
// See: components/linkedin-networking/linkedin-networking-content.js
// The following initialization is DISABLED

// setTimeout(() => {
//   console.log('LinkedIn Feed: Running initial feed check after delay...');
//   checkForLinkedInFeed();
// }, 2000);

console.log('Career Catalyst Assistant: Content script loaded');
console.log('💡 Console functions available:');
console.log('  • toggleJobExtractor(true/false) - Enable/disable automation');
console.log('  • getJobExtractorStatus() - Check current status');
console.log('');
console.log('💡 LinkedIn networking features: See separate component (components/linkedin-networking/)');
console.log('   Enable in extension popup (click extension icon) and use context menu on LinkedIn pages');
