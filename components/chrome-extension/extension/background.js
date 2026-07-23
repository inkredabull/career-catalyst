// Career Catalyst Assistant - Background Script

function setupContextMenus() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'extract-linkedin-connections',
      title: 'Extract LinkedIn Connections',
      contexts: ['page'],
      documentUrlPatterns: [
        'https://www.linkedin.com/company/*/people/*',
        'https://www.linkedin.com/company/*'
      ]
    });
    chrome.contextMenus.create({
      id: 'extract-mutual-connections',
      title: 'Extract Mutual Connections',
      contexts: ['page'],
      documentUrlPatterns: [
        'https://www.linkedin.com/in/*',
        'https://www.linkedin.com/search/results/people/*'
      ]
    });
    chrome.contextMenus.create({
      id: 'add-to-mail-merge',
      title: 'Add to Mail Merge',
      contexts: ['page'],
      documentUrlPatterns: [
        'https://www.linkedin.com/in/*'
      ]
    });
    chrome.contextMenus.create({
      id: 'send-connection-request',
      title: 'Send Connection Request',
      contexts: ['page'],
      documentUrlPatterns: [
        'https://www.linkedin.com/in/*'
      ]
    });
    chrome.contextMenus.create({
      id: 'congrats-and-connect',
      title: 'Congrats and Connect',
      contexts: ['page'],
      documentUrlPatterns: [
        'https://www.linkedin.com/in/*'
      ]
    });
    chrome.contextMenus.create({
      id: 'get-as-google-contact',
      title: 'Get as Google Contact',
      contexts: ['page'],
      documentUrlPatterns: [
        'https://www.linkedin.com/in/*'
      ]
    });
  });
}

chrome.runtime.onInstalled.addListener((details) => {
  console.log('Career Catalyst Assistant installed:', details.reason);
  if (details.reason === 'install') {
    chrome.storage.sync.set({
      firstInstall: Date.now(),
      gutterWidth: 33.333,
      autoDetectJobSites: true,
      linkedInNetworkingEnabled: false
    });
  }
  setupContextMenus();
});

chrome.runtime.onStartup.addListener(() => {
  setupContextMenus();
});

// Handle keyboard commands
chrome.commands.onCommand.addListener((command) => {
  console.log('Command received:', command);

  if (command === 'toggle-panel') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        toggleJobTrackerPanel(tabs[0].id);
      }
    });
  }
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener((info, tab) => {
  console.log('Context menu clicked:', info.menuItemId);

  if (info.menuItemId === 'extract-linkedin-connections') {
    chrome.tabs.sendMessage(tab.id, { action: 'extractLinkedInConnections' }, (response) => {
      if (chrome.runtime.lastError) {
        console.error('Error sending message:', chrome.runtime.lastError);
      } else {
        console.log('LinkedIn connections extraction started');
      }
    });
  }

  if (info.menuItemId === 'extract-mutual-connections') {
    chrome.tabs.sendMessage(tab.id, { action: 'extractMutualConnections' }, (response) => {
      if (chrome.runtime.lastError) {
        console.error('Error sending message:', chrome.runtime.lastError);
      } else {
        console.log('Mutual connections extraction started');
      }
    });
  }

  if (info.menuItemId === 'add-to-mail-merge') {
    chrome.tabs.sendMessage(tab.id, { action: 'addToMailMerge' }, (response) => {
      if (chrome.runtime.lastError) {
        console.error('Error sending message:', chrome.runtime.lastError);
      } else {
        console.log('Add to mail merge triggered');
      }
    });
  }

  if (info.menuItemId === 'send-connection-request') {
    chrome.tabs.sendMessage(tab.id, { action: 'sendConnectionRequest' }, (response) => {
      if (chrome.runtime.lastError) {
        console.error('Error sending message:', chrome.runtime.lastError);
      } else {
        console.log('Send connection request triggered');
      }
    });
  }

  if (info.menuItemId === 'congrats-and-connect') {
    chrome.tabs.sendMessage(tab.id, { action: 'congratsAndConnect' }, (response) => {
      if (chrome.runtime.lastError) {
        console.error('Error sending message:', chrome.runtime.lastError);
      } else {
        console.log('Congrats and connect triggered');
      }
    });
  }

  if (info.menuItemId === 'get-as-google-contact') {
    chrome.tabs.sendMessage(tab.id, { action: 'getAsGoogleContact' }, (response) => {
      if (chrome.runtime.lastError) {
        console.error('Error sending message:', chrome.runtime.lastError);
      } else {
        console.log('Get as Google Contact triggered');
      }
    });
  }
});

// Helper function to toggle job tracker panel
function toggleJobTrackerPanel(tabId) {
  chrome.tabs.sendMessage(tabId, { action: 'toggleGutter' }, function(response) {
    if (chrome.runtime.lastError) {
      console.log('Content script not found, injecting it...');
      // Content script not ready, inject it manually
      chrome.scripting.executeScript({
        target: { tabId: tabId },
        files: ['content.js']
      }, () => {
        // Wait a moment for script to initialize, then try again
        setTimeout(() => {
          chrome.tabs.sendMessage(tabId, { action: 'toggleGutter' }, function(response) {
            if (response?.success) {
              console.log('Panel toggled successfully:', response.isOpen ? 'opened' : 'closed');
            } else {
              console.error('Failed to toggle panel after injection');
            }
          });
        }, 300);
      });
      return;
    }

    if (response?.success) {
      console.log('Panel toggled successfully:', response.isOpen ? 'opened' : 'closed');
    } else {
      console.error('Failed to toggle panel');
    }
  });
}

// NOTE: chrome.action.onClicked doesn't fire when a popup is defined
// Use keyboard command (Ctrl+Shift+J / Cmd+Shift+J) to toggle panel instead
// Or add a button in the popup

// Message handling for future communication between components
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  switch (request.action) {
    case 'log':
      console.log('Career Catalyst:', request.message);
      sendResponse({success: true});
      break;

    case 'callMCPServer':
      handleMCPServerCall(request, sendResponse);
      return true; // Keep message channel open for async response

    case 'extractJob':
      handleExtractJob(request, sendResponse);
      return true; // Keep message channel open for async response

    case 'trackInTeal':
      // Legacy - Teal tracking now handled by openTealAndFill
      sendResponse({success: false, error: 'Use openTealAndFill instead'});
      break;

    case 'openTealAndFill':
      handleOpenTealAndFill(request, sendResponse);
      return true; // Keep message channel open for async response

    case 'extractFromJson':
      handleExtractFromJson(request, sendResponse);
      return true; // Keep message channel open for async response

    case 'loadJobFromLogs':
      handleLoadJobFromLogs(request, sendResponse);
      return true; // Keep message channel open for async response

    case 'createLinkedInPostReminder':
      handleCreateLinkedInPostReminder(request, sendResponse);
      return true; // Keep message channel open for async response

    case 'lookupLinkedInCompany':
      handleLookupLinkedInCompany(request, sendResponse);
      return true; // Keep message channel open for async response

    case 'getCompanyStage':
      handleGetCompanyStage(request, sendResponse);
      return true; // Keep message channel open for async response

    case 'generateBlurb':
      handleGenerateBlurb(request, sendResponse);
      return true; // Keep message channel open for async response

    case 'generateScore':
      handleGenerateScore(request, sendResponse);
      return true; // Keep message channel open for async response

    case 'checkResume':
      handleCheckResume(request, sendResponse);
      return true; // Keep message channel open for async response

    case 'generateResume':
      handleGenerateResume(request, sendResponse);
      return true; // Keep message channel open for async response

    case 'saveResumeDriveUrl':
      handleSaveResumeDriveUrl(request, sendResponse);
      return true; // Keep message channel open for async response

    case 'checkBlurb':
      handleCheckBlurb(request, sendResponse);
      return true; // Keep message channel open for async response

    case 'createGoogleContact':
      handleCreateGoogleContact(request, sendResponse);
      return true; // Keep message channel open for async response

    default:
      sendResponse({success: false, error: 'Unknown action'});
  }
});

// Handle MCP server communication
async function handleMCPServerCall(request, sendResponse) {
  try {
    console.log('═══════════════════════════════════════════════════════════');
    console.log('Career Catalyst Background: Handling MCP server call');
    console.log('  → Question:', request.args.question);
    console.log('  → Question length:', request.args.question.length, 'chars');

    // Extract job description if provided
    const jobDescription = request.args.jobDescription || '';
    console.log('  → Job description provided:', jobDescription ? 'Yes' : 'No');
    console.log('  → Job description length:', jobDescription.length, 'chars');
    if (jobDescription.length > 0) {
      console.log('  → Job description preview:', jobDescription.substring(0, 200) + '...');
    }

    // Test if local unified server is running
    const unifiedServerRunning = await testUnifiedServerConnection();

    if (unifiedServerRunning) {
      console.log('  → Unified server is running, using real CV data');

      // Make request to local unified server
      const jobId = request.args.jobId || null;
      const cvResponse = await callLocalUnifiedServer(request.args.question, jobDescription, jobId);

      console.log('  → Response received from unified server');
      console.log('  → Response length:', cvResponse.length, 'chars');
      console.log('═══════════════════════════════════════════════════════════');

      sendResponse({
        success: true,
        data: cvResponse
      });
    } else {
      console.error('  → Unified server is not running on localhost:3000');
      console.error('  → Please start unified server with: npm run unified-server');

      // Fallback to sample CV content for testing
      const sampleCV = `KEY ACCOMPLISHMENTS

Built scalable web applications serving 10K+ users with 99.9% uptime
Led cross-functional team of 5 engineers to deliver product features ahead of schedule
Implemented automated testing pipeline reducing deployment time by 60%
Optimized database queries improving application performance by 40%

STRENGTHS

* Technical Leadership - Guides engineering teams through complex technical challenges
* Problem Solving - Analyzes issues systematically and implements effective solutions
* Communication - Translates technical concepts for both technical and non-technical stakeholders
* Continuous Learning - Stays current with emerging technologies and industry best practices
* Collaboration - Works effectively across departments to achieve shared business goals`;

      const cvResponse = generateCVResponse(request.args.question, sampleCV, jobDescription);
      console.warn('  → Using fallback sample CV data (unified server not available)');
      console.log('═══════════════════════════════════════════════════════════');

      sendResponse({
        success: true,
        data: cvResponse,
        warning: 'Using sample CV data - unified server not running. Start with: npm run unified-server'
      });
    }

  } catch (error) {
    console.error('  → MCP Server call failed:', error);
    console.log('═══════════════════════════════════════════════════════════');
    sendResponse({
      success: false,
      error: error.message
    });
  }
}

// Test if unified server is running
async function testUnifiedServerConnection() {
  try {
    console.log('Career Catalyst Background: Testing unified server connection...');
    const response = await fetch('http://localhost:3000/health', {
      method: 'GET',
      mode: 'cors',
      headers: {
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(10000) // 10 second timeout
    });
    
    console.log('Career Catalyst Background: Health check response status:', response.status);
    const result = response.ok;
    console.log('Career Catalyst Background: Unified server connection test result:', result);
    return result;
  } catch (error) {
    console.error('Career Catalyst Background: Unified server connection test failed:', error.message, error);
    return false;
  }
}

// Call local unified server for CV questions
async function callLocalUnifiedServer(question, jobDescription = '', jobId = null) {
  try {
    console.log('  → Preparing request to unified server');
    const requestBody = { question: question };

    // Include job ID if available
    if (jobId) {
      requestBody.jobId = jobId;
      console.log('  → Including job ID in request body:', jobId);
    }

    // Include job description context if available
    if (jobDescription.trim()) {
      requestBody.jobDescription = jobDescription;
      console.log('  → Including job description in request body');
      console.log('  → Request body jobDescription length:', requestBody.jobDescription.length, 'chars');
    } else {
      console.log('  → No job description in request body');
    }

    console.log('  → POST to http://localhost:3000/cv-question');
    console.log('  → Request body size:', JSON.stringify(requestBody).length, 'bytes');

    const response = await fetch('http://localhost:3000/cv-question', {
      method: 'POST',
      mode: 'cors',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(30000) // 30 second timeout
    });

    console.log('  → Unified server response status:', response.status);

    if (!response.ok) {
      throw new Error(`Unified server responded with status: ${response.status}`);
    }

    const data = await response.json();
    console.log('  → Response parsed successfully');
    const result = data.response || data.answer || 'No response from unified server';
    console.log('  → CV response length:', result.length, 'chars');
    return result;

  } catch (error) {
    console.error('  → Failed to call unified server:', error);
    throw error;
  }
}

// Generate CV-aware response from parsed CV content
function generateCVResponse(question, cvContent, jobDescription = '') {
  const cvData = parseCV(cvContent);
  const questionType = classifyQuestion(question);
  
  // Add job description context if available
  const jobContext = jobDescription.trim() ? ` given this job description: "${jobDescription.substring(0, 300)}..."` : '';
  
  const responses = {
    experience: () => generateExperienceResponse(cvData, jobContext),
    skills: () => generateSkillsResponse(cvData, jobContext),
    leadership: () => generateLeadershipResponse(cvData, jobContext),
    technical: () => generateTechnicalResponse(cvData, jobContext),
    default: () => generateDefaultResponse(cvData, question, jobContext)
  };
  
  return responses[questionType]();
}

// Classify question type based on keywords
function classifyQuestion(question) {
  const lowerQuestion = question.toLowerCase();
  
  const questionTypes = [
    { keywords: ['experience', 'work', 'job', 'career', 'background'], type: 'experience' },
    { keywords: ['skill', 'strength', 'good at', 'expertise', 'ability'], type: 'skills' },
    { keywords: ['leadership', 'lead', 'manage', 'team', 'management'], type: 'leadership' },
    { keywords: ['technical', 'ai', 'technology', 'engineering', 'development'], type: 'technical' }
  ];
  
  for (const { keywords, type } of questionTypes) {
    if (keywords.some(keyword => lowerQuestion.includes(keyword))) {
      return type;
    }
  }
  
  return 'default';
}

// Generate experience-focused response
function generateExperienceResponse(cvData, jobContext = '') {
  const experienceAreas = extractExperienceAreas(cvData.accomplishments);
  const contextSuffix = jobContext ? `\n\nThis background aligns well${jobContext}` : '';
  
  return `Based on the CV, here are key work experiences:

${formatBulletList(cvData.accomplishments)}

Strong experience in ${experienceAreas.join(', ')} with measurable business impact.${contextSuffix}`;
}

// Generate skills-focused response  
function generateSkillsResponse(cvData, jobContext = '') {
  const contextSuffix = jobContext ? `\n\nThese skills are particularly relevant${jobContext}` : '';
  
  return `Core strengths include:

${formatBulletList(cvData.strengths)}

Excels at combining technical leadership with strong communication and process optimization.${contextSuffix}`;
}

// Generate leadership-focused response
function generateLeadershipResponse(cvData, jobContext = '') {
  const leadershipKeywords = ['launched', 'drove', 'delivered', 'led', 'managed'];
  const communicationKeywords = ['leadership', 'communication', 'collaboration'];
  
  const leadershipAccomplishments = filterByKeywords(cvData.accomplishments, leadershipKeywords);
  const leadershipStrengths = filterByKeywords(cvData.strengths, communicationKeywords);
  const contextSuffix = jobContext ? `\n\nThis leadership experience directly applies${jobContext}` : '';
  
  return `Demonstrates strong leadership through:

**Accomplishments:**
${formatBulletList(leadershipAccomplishments)}

**Leadership Style:**
${formatBulletList(leadershipStrengths)}${contextSuffix}`;
}

// Generate technical-focused response
function generateTechnicalResponse(cvData, jobContext = '') {
  const techKeywords = ['ai', 'data', 'platform', 'technical', 'system', 'application'];
  const techAccomplishments = filterByKeywords(cvData.accomplishments, techKeywords);
  const contextSuffix = jobContext ? `\n\nThis technical expertise is well-suited${jobContext}` : '';
  
  return `Technical background and achievements:

${formatBulletList(techAccomplishments.length > 0 ? techAccomplishments : cvData.accomplishments)}

Combines technical depth with business impact and measurable results.${contextSuffix}`;
}

// Generate comprehensive default response
function generateDefaultResponse(cvData, question, jobContext = '') {
  const contextSuffix = jobContext ? `\n\nThis expertise is particularly relevant${jobContext}` : '';
  
  return `Based on the CV:

**Key Accomplishments:**
${formatBulletList(cvData.accomplishments)}

**Core Strengths:**
${formatBulletList(cvData.strengths)}

This provides expertise relevant to: "${question}"${contextSuffix}`;
}

// Helper function to format bullet lists consistently
function formatBulletList(items) {
  return items.map(item => `• ${item}`).join('\n');
}

// Helper function to filter items by keywords
function filterByKeywords(items, keywords) {
  return items.filter(item => 
    keywords.some(keyword => item.toLowerCase().includes(keyword))
  );
}

// Parse CV content into structured data
function parseCV(content) {
  const sections = {
    name: '',
    accomplishments: [],
    strengths: [],
    experience: []
  };
  
  const lines = content.split('\n').map(line => line.trim()).filter(line => line);
  let currentSection = '';
  
  for (const line of lines) {
    if (line.toUpperCase().includes('KEY ACCOMPLISHMENTS') || line.toUpperCase().includes('ACCOMPLISHMENTS')) {
      currentSection = 'accomplishments';
    } else if (line.toUpperCase().includes('STRENGTHS')) {
      currentSection = 'strengths';
    } else if (line.toUpperCase().includes('EXPERIENCE') || line.toUpperCase().includes('WORK')) {
      currentSection = 'experience';
    } else if (line.includes('___') || line === '' || line.includes('@') || line.includes('+1')) {
      // Skip dividers, empty lines, and contact info
      continue;
    } else if (!line.toUpperCase().includes('ACCOMPLISHMENTS') && !line.toUpperCase().includes('STRENGTHS')) {
      // Add content to current section
      if (currentSection === 'accomplishments') {
        sections.accomplishments.push(line);
      } else if (currentSection === 'strengths') {
        sections.strengths.push(line.replace(/^\*\s*/, '')); // Remove bullet points
      } else if (currentSection === 'experience') {
        sections.experience.push(line);
      } else if (!sections.name && !line.includes('|') && !line.includes('@')) {
        // First non-contact line is likely the name
        sections.name = line;
      }
    }
  }
  
  return sections;
}

// Extract experience areas from accomplishments
function extractExperienceAreas(accomplishments) {
  const areas = new Set();
  
  accomplishments.forEach(acc => {
    const lower = acc.toLowerCase();
    if (lower.includes('marketplace')) areas.add('marketplace development');
    if (lower.includes('ai')) areas.add('AI implementation');
    if (lower.includes('data') && lower.includes('platform')) areas.add('data platform creation');
    if (lower.includes('productivity')) areas.add('productivity optimization');
    if (lower.includes('arr')) areas.add('revenue growth');
  });
  
  return Array.from(areas);
}

// Handle extract job CLI execution
async function handleExtractJob(request, sendResponse) {
  try {
    console.log('Career Catalyst Background: Handling extract job request for URL:', request.url);
    if (request.html) {
      console.log('Career Catalyst Background: HTML content provided for extraction');
    }

    // Make request to local unified server to execute extract command
    // Pass HTML if provided for robust extraction, otherwise fall back to URL
    const extractResponse = await callLocalUnifiedServerForExtract(request.url, request.html);

    sendResponse({
      success: true,
      jobId: extractResponse.jobId,
      filePath: extractResponse.filePath,
      jobData: extractResponse.jobData
    });

  } catch (error) {
    console.error('Career Catalyst Background: Extract job failed:', error);
    sendResponse({
      success: false,
      error: error.message
    });
  }
}

// Call local unified server to execute extract command
async function callLocalUnifiedServerForExtract(url, html) {
  try {
    console.log('Career Catalyst Background: Calling unified server for extraction');

    // Prepare request body - use HTML extraction if HTML provided, otherwise URL extraction
    // IMPORTANT: For LLM extraction mode (preview/display), we skip reminders and post-workflow
    // Users will explicitly click "Track" button to trigger reminders + scoring
    const requestBody = html ? {
      type: 'html',
      html: html,
      url: url, // Still include URL for context/logging
      createReminders: false // Don't create reminders during preview extraction
    } : {
      url: url,
      createReminders: false // Don't create reminders during preview extraction
    };

    console.log(`Career Catalyst Background: Extraction type: ${html ? 'HTML' : 'URL'}`);
    if (html) {
      console.log(`Career Catalyst Background: HTML content size: ${html.length} chars`);
    }

    const response = await fetch('http://localhost:3000/extract', {
      method: 'POST',
      mode: 'cors',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(60000) // 60 second timeout for extraction
    });

    console.log('Career Catalyst Background: Unified server response status:', response.status);

    if (!response.ok) {
      throw new Error(`Unified server responded with status: ${response.status}`);
    }

    const data = await response.json();
    console.log('Career Catalyst Background: Unified server response data:', data);

    if (!data.success) {
      throw new Error(data.error || 'Unified server extraction failed');
    }

    return {
      jobId: data.jobId,
      filePath: data.filePath,
      jobData: data.jobData
    };

  } catch (error) {
    console.error('Career Catalyst Background: Failed to call unified server:', error);

    // Provide a helpful error message
    if (error.name === 'TimeoutError' || error.message.includes('timeout')) {
      throw new Error('Extraction timed out - job sites may take a while to process');
    } else if (error.message.includes('fetch')) {
      throw new Error('Could not connect to unified server. Make sure to run: npm run unified-server');
    } else {
      throw error;
    }
  }
}

// Handle extract from JSON functionality
async function handleExtractFromJson(request, sendResponse) {
  try {
    console.log('Career Catalyst Background: Handling extract from JSON request');
    console.log('Job data:', request.jobData);
    console.log('Reminder priority:', request.reminderPriority);
    console.log('Selected reminders:', request.selectedReminders);

    // Send JSON payload to unified server with type='json' flag and reminder priority
    const extractResponse = await callLocalUnifiedServerWithJson(request.jobData, request.reminderPriority, request.selectedReminders);
    
    sendResponse({
      success: true,
      jobId: extractResponse.jobId,
      filePath: extractResponse.filePath,
      jobData: extractResponse.jobData
    });
    
  } catch (error) {
    console.error('Career Catalyst Background: Extract from JSON failed:', error);
    sendResponse({
      success: false,
      error: error.message
    });
  }
}

// Handle load job from logs request
async function handleLoadJobFromLogs(request, sendResponse) {
  try {
    console.log('Career Catalyst Background: Loading job from logs for ID:', request.jobId);

    if (!request.jobId) {
      sendResponse({
        success: false,
        error: 'Job ID is required'
      });
      return;
    }

    // Call unified server to load job data from logs
    const response = await fetch('http://localhost:3000/load-job', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ jobId: request.jobId })
    });

    if (!response.ok) {
      throw new Error(`Server responded with status: ${response.status}`);
    }

    const data = await response.json();

    if (!data.success) {
      throw new Error(data.error || 'Failed to load job from logs');
    }

    console.log('Career Catalyst Background: Successfully loaded job from logs');
    sendResponse({
      success: true,
      jobData: data.jobData
    });

  } catch (error) {
    console.error('Career Catalyst Background: Failed to load job from logs:', error);
    sendResponse({
      success: false,
      error: error.message
    });
  }
}

// Handle generate blurb request
async function handleGenerateBlurb(request, sendResponse) {
  try {
    console.log('Career Catalyst Background: Handling generate blurb request');
    console.log('Job ID:', request.jobId);
    if (request.companyWebsite) {
      console.log('Company Website:', request.companyWebsite);
    }

    if (!request.jobId) {
      sendResponse({
        success: false,
        error: 'Job ID is required'
      });
      return;
    }

    // Call unified server to generate blurb
    const blurbResponse = await callUnifiedServerGenerateBlurb(request.jobId, request.companyWebsite, request.person, request.fromBlurb);

    sendResponse({
      success: true,
      jobId: blurbResponse.jobId,
      blurb: blurbResponse.blurb,
      characterCount: blurbResponse.characterCount
    });

  } catch (error) {
    console.error('Career Catalyst Background: Generate blurb failed:', error);
    sendResponse({
      success: false,
      error: error.message
    });
  }
}

// Call unified server to generate blurb
async function callUnifiedServerGenerateBlurb(jobId, companyWebsite = '', person = 'third', fromBlurb = null) {
  try {
    console.log('Career Catalyst Background: Calling unified server for blurb generation');

    const requestBody = {
      jobId: jobId,
      person: person
    };

    if (companyWebsite) {
      requestBody.companyWebsite = companyWebsite;
    }

    if (fromBlurb) {
      requestBody.fromBlurb = fromBlurb;
    }

    const response = await fetch('http://localhost:3000/generate-blurb', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || `Server returned ${response.status}`);
    }

    const data = await response.json();
    console.log('Career Catalyst Background: Blurb generated successfully');

    return data;

  } catch (error) {
    console.error('Career Catalyst Background: Failed to call unified server for blurb:', error);
    throw new Error(`Failed to generate blurb: ${error.message}`);
  }
}

// Handle generate score request
async function handleGenerateScore(request, sendResponse) {
  try {
    console.log('Career Catalyst Background: Handling generate score request');
    console.log('Job ID:', request.jobId);

    if (!request.jobId) {
      sendResponse({
        success: false,
        error: 'Job ID is required'
      });
      return;
    }

    // Call unified server to generate score
    const scoreResponse = await callUnifiedServerGenerateScore(request.jobId);

    sendResponse({
      success: true,
      jobId: scoreResponse.jobId,
      score: scoreResponse.score
    });

  } catch (error) {
    console.error('Career Catalyst Background: Generate score failed:', error);
    sendResponse({
      success: false,
      error: error.message
    });
  }
}

// Call unified server to generate score
async function callUnifiedServerGenerateScore(jobId) {
  try {
    console.log('Career Catalyst Background: Calling unified server for score generation');

    const response = await fetch('http://localhost:3000/generate-score', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ jobId: jobId })
    });

    if (!response.ok) {
      throw new Error(`Server responded with status: ${response.status}`);
    }

    const data = await response.json();
    console.log('Career Catalyst Background: Score generated successfully');

    return data;

  } catch (error) {
    console.error('Career Catalyst Background: Failed to call unified server for score:', error);
    throw new Error(`Failed to generate score: ${error.message}`);
  }
}

// Handle check resume request
async function handleCheckResume(request, sendResponse) {
  try {
    console.log('Career Catalyst Background: Checking for resume');
    console.log('Job ID:', request.jobId);

    if (!request.jobId) {
      sendResponse({
        success: false,
        error: 'Job ID is required'
      });
      return;
    }

    // Check if resume files exist in logs directory
    const resumeCheck = await checkResumeInLogs(request.jobId);

    sendResponse({
      success: true,
      exists: resumeCheck.exists,
      resumePath: resumeCheck.path,
      driveUrl: resumeCheck.driveUrl
    });

  } catch (error) {
    console.error('Career Catalyst Background: Check resume failed:', error);
    sendResponse({
      success: false,
      error: error.message
    });
  }
}

// Check if resume exists in logs directory
async function checkResumeInLogs(jobId) {
  try {
    // Call unified server to check for resume
    const response = await fetch(`http://localhost:3000/check-resume/${jobId}`, {
      method: 'GET',
    });

    if (!response.ok) {
      throw new Error(`Server responded with status: ${response.status}`);
    }

    const data = await response.json();
    return {
      exists: data.exists,
      path: data.resumePath,
      driveUrl: data.driveUrl || null
    };

  } catch (error) {
    console.error('Career Catalyst Background: Failed to check resume:', error);
    return { exists: false, path: null, driveUrl: null };
  }
}

// Handle check blurb request
async function handleCheckBlurb(request, sendResponse) {
  try {
    console.log('Career Catalyst Background: Checking for blurb');
    console.log('Job ID:', request.jobId, 'Person:', request.person);

    if (!request.jobId || !request.person) {
      sendResponse({
        success: false,
        error: 'Job ID and person are required'
      });
      return;
    }

    // Check if blurb files exist in logs directory
    const blurbCheck = await checkBlurbInLogs(request.jobId, request.person);

    sendResponse({
      success: true,
      exists: blurbCheck.exists,
      blurbContent: blurbCheck.content
    });

  } catch (error) {
    console.error('Career Catalyst Background: Check blurb failed:', error);
    sendResponse({
      success: false,
      error: error.message
    });
  }
}

// Check if blurb exists in logs directory
async function checkBlurbInLogs(jobId, person) {
  try {
    // Call unified server to check for blurb
    const response = await fetch(`http://localhost:3000/check-blurb/${jobId}/${person}`, {
      method: 'GET',
    });

    if (!response.ok) {
      throw new Error(`Server responded with status: ${response.status}`);
    }

    const data = await response.json();
    return {
      exists: data.exists,
      content: data.blurbContent
    };

  } catch (error) {
    console.error('Career Catalyst Background: Failed to check blurb:', error);
    return { exists: false, content: null };
  }
}

// Handle generate resume request
async function handleGenerateResume(request, sendResponse) {
  try {
    console.log('Career Catalyst Background: Handling generate resume request');
    console.log('Job ID:', request.jobId);

    if (!request.jobId) {
      sendResponse({
        success: false,
        error: 'Job ID is required'
      });
      return;
    }

    // Call unified server to generate resume
    const resumeResponse = await callUnifiedServerGenerateResume(request.jobId);

    sendResponse({
      success: true,
      jobId: resumeResponse.jobId,
      resumePath: resumeResponse.resumePath
    });

  } catch (error) {
    console.error('Career Catalyst Background: Generate resume failed:', error);
    sendResponse({
      success: false,
      error: error.message
    });
  }
}

// Handle save resume Drive URL request
async function handleSaveResumeDriveUrl(request, sendResponse) {
  try {
    console.log('Career Catalyst Background: Saving resume Drive URL');
    console.log('Job ID:', request.jobId);
    console.log('Drive URL:', request.driveUrl);

    if (!request.jobId || !request.driveUrl) {
      sendResponse({
        success: false,
        error: 'Job ID and Drive URL are required'
      });
      return;
    }

    // Call unified server to save the URL
    const response = await fetch('http://localhost:3000/save-resume-drive-url', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jobId: request.jobId,
        driveUrl: request.driveUrl
      }),
    });

    if (!response.ok) {
      throw new Error(`Server responded with status: ${response.status}`);
    }

    const data = await response.json();
    sendResponse({
      success: true,
      jobId: data.jobId
    });

  } catch (error) {
    console.error('Career Catalyst Background: Save Drive URL failed:', error);
    sendResponse({
      success: false,
      error: error.message
    });
  }
}

// Call unified server to generate resume
async function callUnifiedServerGenerateResume(jobId) {
  try {
    console.log('Career Catalyst Background: Calling unified server for resume generation');

    const response = await fetch('http://localhost:3000/generate-resume', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ jobId: jobId })
    });

    if (!response.ok) {
      throw new Error(`Server responded with status: ${response.status}`);
    }

    const data = await response.json();
    console.log('Career Catalyst Background: Resume generated successfully');

    return data;

  } catch (error) {
    console.error('Career Catalyst Background: Failed to call unified server for resume:', error);
    throw new Error(`Failed to generate resume: ${error.message}`);
  }
}

// Call local unified server with JSON data
async function callLocalUnifiedServerWithJson(jobData, reminderPriority = 5, selectedReminders = null) {
  try {
    console.log('Career Catalyst Background: Calling unified server for JSON extraction');

    const requestBody = {
      type: 'json',
      data: jobData,
      reminderPriority: reminderPriority,
      createReminders: true  // Track button explicitly creates reminders
    };

    // Add selectedReminders if provided
    if (selectedReminders && selectedReminders.length > 0) {
      requestBody.selectedReminders = selectedReminders;
    }

    const response = await fetch('http://localhost:3000/extract', {
      method: 'POST',
      mode: 'cors',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(90000) // 90 second timeout for JSON processing (allows time for reminders)
    });
    
    console.log('Career Catalyst Background: Unified server response status:', response.status);
    
    if (!response.ok) {
      throw new Error(`Unified server responded with status: ${response.status}`);
    }
    
    const data = await response.json();
    console.log('Career Catalyst Background: Unified server response data:', data);
    
    if (!data.success) {
      throw new Error(data.error || 'Unified server JSON extraction failed');
    }
    
    return {
      jobId: data.jobId,
      filePath: data.filePath,
      jobData: data.jobData
    };
    
  } catch (error) {
    console.error('Career Catalyst Background: Failed to call unified server with JSON:', error);
    
    // Provide a helpful error message
    if (error.name === 'TimeoutError' || error.message.includes('timeout')) {
      throw new Error('JSON processing timed out');
    } else if (error.message.includes('fetch')) {
      throw new Error('Could not connect to unified server. Make sure to run: npm run unified-server');
    } else {
      throw error;
    }
  }
}

// Handle opening Teal tab and filling form
async function handleOpenTealAndFill(request, sendResponse) {
  try {
    console.log('Career Catalyst Background: Opening Teal tab and filling form');
    console.log('Job info:', request.jobInfo);
    
    // Create new tab for Teal
    const tab = await chrome.tabs.create({
      url: 'https://app.tealhq.com/job-tracker',
      active: true
    });
    
    // Wait for tab to load, then inject the form-filling script
    chrome.tabs.onUpdated.addListener(function listener(tabId, changeInfo) {
      if (tabId === tab.id && changeInfo.status === 'complete') {
        // Remove listener to avoid multiple executions
        chrome.tabs.onUpdated.removeListener(listener);
        
        // Add delay before injection to ensure tab is fully loaded
        setTimeout(() => {
          console.log('Career Catalyst Background: Attempting to inject form filling script...');
          
          // Inject the Teal form-filling script
          chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: fillTealForm,
            args: [request.jobInfo]
          }).then((results) => {
            console.log('Career Catalyst Background: Form filling script injected successfully');
            console.log('Career Catalyst Background: Injection results:', results);
            if (results && results[0] && results[0].error) {
              console.error('Career Catalyst Background: Script execution error:', results[0].error);
            }
          }).catch((error) => {
            console.error('Career Catalyst Background: Failed to inject script:', error);
            console.error('Error details:', {
              message: error.message,
              stack: error.stack,
              name: error.name
            });
          });
        }, 1000); // Wait 1 second after page complete
      }
    });
    
    sendResponse({
      success: true,
      message: 'Teal tab opened and automation started'
    });
    
  } catch (error) {
    console.error('Career Catalyst Background: Failed to open Teal tab:', error);
    sendResponse({
      success: false,
      error: error.message
    });
  }
}

// Function to be injected into Teal tab for form filling
function fillTealForm(jobInfo) {
  // Immediate test log
  console.log('🎯 TEAL FORM FILLER: Script successfully injected and executing!');
  console.log('🎯 TEAL FORM FILLER: Received normalized job data:', jobInfo);
  console.log('🎯 TEAL FORM FILLER: Job fields:', {
    title: jobInfo.title,
    company: jobInfo.company,
    location: jobInfo.location,
    url: jobInfo.url,
    hasDescription: !!jobInfo.description
  });
  console.log('🎯 TEAL FORM FILLER: Current URL:', window.location.href);
  console.log('🎯 TEAL FORM FILLER: Document ready state:', document.readyState);
  
  try {
    console.log('Teal Form Filler: Starting automation with job info:', jobInfo);
  
  // Function to wait for element to appear
  function waitForElement(selector, timeout = 10000) {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      
      function checkForElement() {
        const element = document.querySelector(selector);
        if (element) {
          resolve(element);
          return;
        }
        
        if (Date.now() - startTime > timeout) {
          reject(new Error(`Element ${selector} not found within ${timeout}ms`));
          return;
        }
        
        setTimeout(checkForElement, 100);
      }
      
      checkForElement();
    });
  }
  
  // Function to find add button by text content
  function findAddJobButton() {
    const buttons = document.querySelectorAll('button');
    console.log(`Teal Form Filler: Found ${buttons.length} buttons on page`);
    
    for (const button of buttons) {
      const text = button.textContent.toLowerCase();
      console.log(`Teal Form Filler: Button text: "${text}"`);
      
      if ((text.includes('add') && text.includes('job')) || 
          (text.includes('new') && text.includes('job')) ||
          text.includes('add a new job')) {
        console.log(`Teal Form Filler: Found matching button: "${button.textContent}"`);
        return button;
      }
    }
    
    // Also check for buttons with + symbols or icons
    for (const button of buttons) {
      if (button.textContent.includes('+') || 
          button.querySelector('svg') || 
          button.classList.toString().toLowerCase().includes('add')) {
        console.log(`Teal Form Filler: Found potential add button (icon/class): "${button.textContent}"`);
        return button;
      }
    }
    
    return null;
  }
  
  // Wait longer for page to be fully loaded and interactive
  setTimeout(async () => {
    try {
      console.log('Teal Form Filler: Page should be loaded, starting button search...');
      console.log('Teal Form Filler: Current URL:', window.location.href);
      console.log('Teal Form Filler: Document ready state:', document.readyState);
      
      // Wait a bit more for any dynamic content to load
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Look for and click the "Add a new job" button
      console.log('Teal Form Filler: Looking for "Add a new job" button...');
      
      let addButton = findAddJobButton();
      
      // If still not found, try waiting a bit more and search again
      if (!addButton) {
        console.log('Teal Form Filler: Button not found on first attempt, waiting and retrying...');
        await new Promise(resolve => setTimeout(resolve, 3000));
        addButton = findAddJobButton();
      }
      
      if (!addButton) {
        console.log('Teal Form Filler: Could not find "Add a new job" button');
        console.log('Teal Form Filler: Available buttons:');
        document.querySelectorAll('button').forEach((btn, i) => {
          console.log(`  ${i + 1}. "${btn.textContent.trim()}" (classes: ${btn.className})`);
        });
        return;
      }
      
      // Click the button
      console.log('Teal Form Filler: Clicking add job button...');
      addButton.click();
      
      // Also try triggering other events in case click doesn't work
      addButton.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      addButton.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      addButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      
      // Wait for modal to appear
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Fill in the form fields
      console.log('Teal Form Filler: Attempting to fill job information...');
      
      const formFieldMappings = [
        // Job Title field (name="role")
        {
          selectors: ['input[name="role"]', 'input[placeholder="Job Title"]', 'input[placeholder*="title" i]'],
          value: jobInfo.title,
          name: 'Job Title'
        },
        // URL field (name="url")
        {
          selectors: ['input[name="url"]', 'input[placeholder="URL for Original Posting"]', 'input[placeholder*="url" i]'],
          value: jobInfo.url || window.location.href,
          name: 'Job URL'
        },
        // Company field (name="company_name")
        {
          selectors: ['input[name="company_name"]', 'input[placeholder="Company Name"]', 'input[placeholder*="company" i]'],
          value: jobInfo.company,
          name: 'Company Name'
        },
        // Location field (name="location")
        {
          selectors: ['input[name="location"]', 'input[placeholder="Location"]', 'input[placeholder*="location" i]'],
          value: jobInfo.location,
          name: 'Location'
        },
        // Description field (contenteditable div with TipTap editor)
        {
          selectors: ['.tiptap.ProseMirror', '[contenteditable="true"]', 'textarea[placeholder*="description" i]'],
          value: jobInfo.description,
          name: 'Job Description',
          isContentEditable: true
        }
      ];
      
      for (const field of formFieldMappings) {
        if (!field.value) continue; // Skip empty fields
        
        let fieldFilled = false;
        for (const selector of field.selectors) {
          try {
            const element = document.querySelector(selector);
            if (element) {
              if (field.isContentEditable) {
                // Handle contenteditable TipTap editor for job description
                element.click();
                await new Promise(resolve => setTimeout(resolve, 500)); // Wait for editor to focus
                
                // Clear existing content and add new content
                element.focus();
                
                // Try multiple approaches to clear and fill the contenteditable element
                try {
                  // Method 1: Simple textContent replacement (most reliable)
                  element.textContent = field.value;
                } catch (e1) {
                  try {
                    // Method 2: innerHTML approach
                    element.innerHTML = field.value.replace(/</g, '&lt;').replace(/>/g, '&gt;');
                  } catch (e2) {
                    try {
                      // Method 3: Selection API approach (if available)
                      const range = document.createRange();
                      range.selectNodeContents(element);
                      const selection = window.getSelection();
                      selection.removeAllRanges();
                      selection.addRange(range);
                      document.execCommand('insertText', false, field.value);
                    } catch (e3) {
                      console.error('Teal Form Filler: All methods failed for contenteditable:', e3);
                    }
                  }
                }
              } else {
                // Handle regular input fields
                element.focus();
                element.select();
                element.value = field.value;
                
                // Trigger input events to notify React/Vue of the change
                element.dispatchEvent(new Event('input', { bubbles: true }));
                element.dispatchEvent(new Event('change', { bubbles: true }));
              }
              
              fieldFilled = true;
              console.log(`Teal Form Filler: Filled ${field.name}: ${field.value.substring(0, 50)}${field.value.length > 50 ? '...' : ''}`);
              break;
            }
          } catch (error) {
            console.error(`Teal Form Filler: Error filling ${field.name}:`, error);
          }
        }
        
        if (!fieldFilled) {
          console.log(`Teal Form Filler: Could not find field for ${field.name}`);
        }
        
        // Small delay between fields
        await new Promise(resolve => setTimeout(resolve, 300));
      }
      
      console.log('Teal Form Filler: Form filling completed!');
      
    } catch (error) {
      console.error('Teal Form Filler: Error during form filling:', error);
    }
  }, 5000); // Wait 5 seconds for page to load
  } catch (globalError) {
    console.error('Teal Form Filler: Critical error in fillTealForm:', globalError);
  }
}

// Handle creating reminder for saved LinkedIn posts
async function handleCreateLinkedInPostReminder(request, sendResponse) {
  try {
    console.log('LinkedIn Feed Background: Creating reminder for saved post');
    console.log('Post info:', request.postInfo);
    
    // Test if local unified server is running
    const unifiedServerRunning = await testUnifiedServerConnection();
    
    if (!unifiedServerRunning) {
      console.error('LinkedIn Feed Background: Unified server not running on localhost:3000');
      sendResponse({
        success: false,
        error: 'Unified server not running. Start with: npm run unified-server'
      });
      return;
    }
    
    // Create reminder data matching the MacOS reminder format
    const reminderData = {
      title: request.postInfo.title,
      notes: `LinkedIn Post by ${request.postInfo.author}\n\n${request.postInfo.content}\n\nSaved from: ${request.postInfo.url}`,
      priority: 5, // Medium priority
      dueDate: null, // No due date for saved posts
      listName: 'LinkedIn Saved Posts' // Create a specific list for LinkedIn posts
    };
    
    // Call unified server to create reminder via CLI
    const reminderResponse = await callUnifiedServerForLinkedInReminder(reminderData);
    
    sendResponse({
      success: true,
      reminderId: reminderResponse.reminderId,
      message: 'Reminder created for LinkedIn post'
    });
    
  } catch (error) {
    console.error('LinkedIn Feed Background: Failed to create reminder:', error);
    sendResponse({
      success: false,
      error: error.message
    });
  }
}

// Call unified server to create LinkedIn post reminder
async function callUnifiedServerForLinkedInReminder(reminderData) {
  try {
    console.log('LinkedIn Feed Background: Calling unified server for reminder creation');
    
    const response = await fetch('http://localhost:3000/linkedin-reminder', {
      method: 'POST',
      mode: 'cors',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(reminderData),
      signal: AbortSignal.timeout(10000) // 10 second timeout
    });
    
    console.log('LinkedIn Feed Background: Unified server response status:', response.status);
    
    if (!response.ok) {
      throw new Error(`Unified server responded with status: ${response.status}`);
    }
    
    const data = await response.json();
    console.log('LinkedIn Feed Background: Unified server response data:', data);
    
    if (!data.success) {
      throw new Error(data.error || 'Unified server reminder creation failed');
    }
    
    return {
      reminderId: data.reminderId || 'created'
    };
    
  } catch (error) {
    console.error('LinkedIn Feed Background: Failed to call unified server for reminder:', error);
    
    if (error.name === 'TimeoutError' || error.message.includes('timeout')) {
      throw new Error('Reminder creation timed out');
    } else if (error.message.includes('fetch')) {
      throw new Error('Could not connect to unified server. Make sure to run: npm run unified-server');
    } else {
      throw error;
    }
  }
}

// Handle LinkedIn company lookup
async function handleLookupLinkedInCompany(request, sendResponse) {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('Career Catalyst Background: Looking up LinkedIn company');
  console.log('  → Company name:', request.companyName);

  try {
    const companyName = request.companyName;
    const linkedInCompanySlug = request.linkedInCompanySlug || '';

    if (!companyName) {
      console.log('  → Error: No company name provided');
      console.log('═══════════════════════════════════════════════════════════');
      sendResponse({
        success: false,
        error: 'Company name is required'
      });
      return;
    }

    // Strategy 0: Use known slug from job cache — fetch company page directly, no search needed.
    if (linkedInCompanySlug) {
      console.log('  → Strategy 0 (direct slug fetch):', linkedInCompanySlug);
      const slugUrl = `https://www.linkedin.com/company/${encodeURIComponent(linkedInCompanySlug)}/`;
      try {
        const slugResp = await fetch(slugUrl, {
          method: 'GET',
          headers: { 'Accept': 'text/html' },
          signal: AbortSignal.timeout(10000)
        });
        if (slugResp.ok) {
          const slugHtml = await slugResp.text();
          const urnMatch = /"entityUrn":"urn:li:company:(\d+)"/.exec(slugHtml);
          if (urnMatch) {
            console.log('  → Strategy 0 found company ID:', urnMatch[1]);
            console.log('═══════════════════════════════════════════════════════════');
            sendResponse({ success: true, companyId: urnMatch[1], companyName });
            return;
          }
          console.log('  → Strategy 0: page fetched but no entityUrn found — falling through to search');
        } else {
          console.log('  → Strategy 0: fetch returned', slugResp.status, '— falling through to search');
        }
      } catch (slugErr) {
        console.log('  → Strategy 0 failed:', slugErr.message, '— falling through to search');
      }
    }

    // Use LinkedIn search to find the company
    // We'll search for the company and try to extract the company ID from the results
    console.log('  → Searching LinkedIn for company:', companyName);

    const searchUrl = `https://www.linkedin.com/search/results/companies/?keywords=${encodeURIComponent(companyName)}`;
    console.log('  → Search URL:', searchUrl);

    // Fetch the LinkedIn search page
    const response = await fetch(searchUrl, {
      method: 'GET',
      headers: {
        'Accept': 'text/html',
      },
      signal: AbortSignal.timeout(10000) // 10 second timeout
    });

    if (!response.ok) {
      throw new Error(`LinkedIn search responded with status: ${response.status}`);
    }

    const html = await response.text();
    console.log('  → Received HTML response, length:', html.length, 'chars');

    const safeCompany = companyName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    let companyId = null;

    // Strategy 1: entityUrn + name/universalName proximity in LinkedIn's embedded Voyager JSON.
    // LinkedIn embeds its API data as JSON in <code> elements — company name and entityUrn
    // appear in the same JSON object, so they are always adjacent.
    const entityUrnRe = /"entityUrn":"urn:li:company:(\d+)"/g;
    const nameProxRe = new RegExp(`"(?:name|universalName|localizedName)"\\s*:\\s*"[^"]*${safeCompany}[^"]*"`, 'i');
    for (const m of html.matchAll(entityUrnRe)) {
      const start = Math.max(0, m.index - 1200);
      const end = Math.min(html.length, m.index + 1200);
      if (nameProxRe.test(html.substring(start, end))) {
        companyId = m[1];
        console.log('  → Strategy 1 (entityUrn+name JSON): found', companyId);
        break;
      }
    }

    // Strategy 2: universalName field = lowercase slug that LinkedIn assigns (e.g. "mercor")
    if (!companyId) {
      const slugRe = new RegExp(`"universalName"\\s*:\\s*"${safeCompany.toLowerCase()}"`, 'i');
      const slugMatch = slugRe.exec(html);
      if (slugMatch) {
        const start = Math.max(0, slugMatch.index - 800);
        const end = Math.min(html.length, slugMatch.index + 800);
        const urnHit = /"entityUrn":"urn:li:company:(\d+)"/.exec(html.substring(start, end));
        if (urnHit) {
          companyId = urnHit[1];
          console.log('  → Strategy 2 (universalName slug): found', companyId);
        }
      }
    }

    // Strategy 3: href proximity — company name as visible text near /company/ID/ links.
    // Less reliable on LinkedIn (names often only appear in JSON, not adjacent to hrefs).
    if (!companyId) {
      const hrefRe = /\/company\/([^\/\?"]+)\//g;
      const hrefMatches = [...html.matchAll(hrefRe)].filter(m => !m[1].includes('.'));
      const searchTermLower = companyName.toLowerCase().trim();
      for (const m of hrefMatches) {
        const start = Math.max(0, m.index - 800);
        const end = Math.min(html.length, m.index + 800);
        if (html.substring(start, end).toLowerCase().includes(searchTermLower)) {
          companyId = m[1];
          console.log('  → Strategy 3 (href proximity): found', companyId);
          break;
        }
      }
    }

    console.log('  → Final company ID:', companyId || 'none found');
    console.log('═══════════════════════════════════════════════════════════');

    if (companyId) {
      sendResponse({ success: true, companyId, companyName });
    } else {
      sendResponse({
        success: false,
        error: `Could not find "${companyName}" on LinkedIn. Try searching manually first.`
      });
    }

  } catch (error) {
    console.error('  → LinkedIn company lookup failed:', error);
    console.log('═══════════════════════════════════════════════════════════');

    sendResponse({
      success: false,
      error: error.message || 'Failed to lookup company on LinkedIn'
    });
  }
}

// Handle getting company stage from LinkedIn
async function handleGetCompanyStage(request, sendResponse) {
  try {
    console.log('═══════════════════════════════════════════════════════════');
    console.log('Career Catalyst Background: Getting company stage from LinkedIn');
    console.log('  → Company name:', request.companyName);

    const companyName = request.companyName;

    if (!companyName) {
      console.log('  → Error: No company name provided');
      console.log('═══════════════════════════════════════════════════════════');
      sendResponse({
        success: false,
        error: 'Company name is required'
      });
      return;
    }

    // Step 1: Search for the company to get its ID
    const searchUrl = `https://www.linkedin.com/search/results/companies/?keywords=${encodeURIComponent(companyName)}`;
    console.log('  → Searching LinkedIn:', searchUrl);

    const searchResponse = await fetch(searchUrl, {
      method: 'GET',
      headers: {
        'Accept': 'text/html',
      },
      signal: AbortSignal.timeout(10000)
    });

    if (!searchResponse.ok) {
      throw new Error(`LinkedIn search failed with status: ${searchResponse.status}`);
    }

    const searchHtml = await searchResponse.text();

    // Extract company ID using the same three-strategy approach as handleLookupLinkedInCompany
    const safeStageCompany = companyName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    let bestStageId = null;

    // Strategy 1: entityUrn + name proximity in LinkedIn's embedded Voyager JSON
    const stageEntityRe = /"entityUrn":"urn:li:company:(\d+)"/g;
    const stageNameProxRe = new RegExp(`"(?:name|universalName|localizedName)"\\s*:\\s*"[^"]*${safeStageCompany}[^"]*"`, 'i');
    for (const m of searchHtml.matchAll(stageEntityRe)) {
      const start = Math.max(0, m.index - 1200);
      const end = Math.min(searchHtml.length, m.index + 1200);
      if (stageNameProxRe.test(searchHtml.substring(start, end))) {
        bestStageId = m[1];
        break;
      }
    }
    // Strategy 2: universalName slug
    if (!bestStageId) {
      const stageSlugRe = new RegExp(`"universalName"\\s*:\\s*"${safeStageCompany.toLowerCase()}"`, 'i');
      const stageSlugMatch = stageSlugRe.exec(searchHtml);
      if (stageSlugMatch) {
        const start = Math.max(0, stageSlugMatch.index - 800);
        const end = Math.min(searchHtml.length, stageSlugMatch.index + 800);
        const urnHit = /"entityUrn":"urn:li:company:(\d+)"/.exec(searchHtml.substring(start, end));
        if (urnHit) bestStageId = urnHit[1];
      }
    }
    // Strategy 3: href proximity
    if (!bestStageId) {
      const hrefRe = /\/company\/([^\/\?"]+)\//g;
      const hrefMs = [...searchHtml.matchAll(hrefRe)].filter(m => !m[1].includes('.'));
      const stageTerm = companyName.toLowerCase().trim();
      for (const m of hrefMs) {
        const start = Math.max(0, m.index - 800);
        const end = Math.min(searchHtml.length, m.index + 800);
        if (searchHtml.substring(start, end).toLowerCase().includes(stageTerm)) {
          bestStageId = m[1];
          break;
        }
      }
    }
    const matches = bestStageId ? [{ 1: bestStageId }] : [];

    if (matches.length === 0) {
      console.log('  → No company found in search results');
      console.log('═══════════════════════════════════════════════════════════');
      sendResponse({
        success: false,
        error: `Could not find "${companyName}" on LinkedIn`
      });
      return;
    }

    const companyId = matches[0][1];
    console.log('  → Found company ID:', companyId);

    // Step 2: Fetch the company's about page
    const aboutUrl = `https://www.linkedin.com/company/${companyId}/about/`;
    console.log('  → Fetching company page:', aboutUrl);

    const aboutResponse = await fetch(aboutUrl, {
      method: 'GET',
      headers: {
        'Accept': 'text/html',
      },
      signal: AbortSignal.timeout(10000)
    });

    if (!aboutResponse.ok) {
      throw new Error(`LinkedIn company page failed with status: ${aboutResponse.status}`);
    }

    const aboutHtml = await aboutResponse.text();
    console.log('  → Received company page, length:', aboutHtml.length, 'chars');

    // Step 3: Extract company information that indicates stage
    let stage = '';

    // Look for company size (can indicate stage)
    const sizePatterns = [
      /(\d+[\-–]\d+)\s+employees/i,
      /(\d+\+?)\s+employees/i,
      /([\d,]+)\s+employees/i
    ];

    for (const pattern of sizePatterns) {
      const match = aboutHtml.match(pattern);
      if (match) {
        const sizeStr = match[1].toLowerCase();
        console.log('  → Found company size:', sizeStr);

        // Interpret size to suggest stage
        if (sizeStr.includes('-')) {
          const parts = sizeStr.split(/[-–]/);
          const maxSize = parseInt(parts[1].replace(/,/g, ''));
          if (maxSize <= 50) {
            stage = 'Early-stage Startup';
          } else if (maxSize <= 200) {
            stage = 'Growth-stage';
          } else if (maxSize <= 1000) {
            stage = 'Mid-size';
          } else {
            stage = 'Enterprise';
          }
        } else if (sizeStr.includes('+')) {
          const num = parseInt(sizeStr.replace(/[,+]/g, ''));
          if (num >= 10000) {
            stage = 'Large Enterprise';
          } else {
            stage = 'Enterprise';
          }
        }
        break;
      }
    }

    // Look for explicit funding/stage mentions in the description
    const stageKeywords = [
      { pattern: /series\s+[a-e]/i, stage: (match) => match[0].toUpperCase() },
      { pattern: /seed\s+funded/i, stage: 'Seed' },
      { pattern: /publicly\s+traded/i, stage: 'Public' },
      { pattern: /fortune\s+\d+/i, stage: 'Fortune 500' },
      { pattern: /ipo/i, stage: 'Public/IPO' },
      { pattern: /venture[-\s]backed/i, stage: 'Venture-backed' },
      { pattern: /private\s+equity/i, stage: 'Private Equity' }
    ];

    for (const { pattern, stage: stageFn } of stageKeywords) {
      const match = aboutHtml.match(pattern);
      if (match) {
        stage = typeof stageFn === 'function' ? stageFn(match) : stageFn;
        console.log('  → Found stage keyword:', stage);
        break;
      }
    }

    console.log('  → Final stage determination:', stage || 'Not determined');
    console.log('═══════════════════════════════════════════════════════════');

    sendResponse({
      success: true,
      stage: stage,
      companyId: companyId
    });

  } catch (error) {
    console.error('  → Company stage lookup failed:', error);
    console.log('═══════════════════════════════════════════════════════════');

    sendResponse({
      success: false,
      error: error.message || 'Failed to get company stage from LinkedIn'
    });
  }
}

// Get a Google OAuth token via chrome.identity, retrying once on a stale cached token
function getGoogleAuthToken(interactive) {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive }, (token) => {
      if (chrome.runtime.lastError || !token) {
        reject(new Error(chrome.runtime.lastError?.message || 'Failed to obtain Google auth token'));
        return;
      }
      resolve(token);
    });
  });
}

function removeCachedGoogleAuthToken(token) {
  return new Promise((resolve) => {
    chrome.identity.removeCachedAuthToken({ token }, resolve);
  });
}

// Create a contact via the Google People API, returning { resourceName, contactUrl }
async function createGooglePeopleContact(contact) {
  let token = await getGoogleAuthToken(true);

  const person = {
    names: [{ givenName: contact.firstName, familyName: contact.lastName }],
    urls: [{ value: contact.linkedinUrl, type: 'work' }],
    biographies: [{ value: 'Added from LinkedIn via Career Catalyst', contentType: 'TEXT_PLAIN' }],
    userDefined: [{ key: 'Year', value: contact.currentYear }]
  };
  if (contact.email) {
    person.emailAddresses = [{ value: contact.email, type: 'work' }];
  }

  let response = await fetch('https://people.googleapis.com/v1/people:createContact', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(person)
  });

  if (response.status === 401) {
    await removeCachedGoogleAuthToken(token);
    token = await getGoogleAuthToken(true);
    response = await fetch('https://people.googleapis.com/v1/people:createContact', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(person)
    });
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error?.message || `People API responded with status ${response.status}`);
  }

  const data = await response.json();
  const resourceName = data.resourceName || '';
  const contactId = resourceName.replace('people/', '');
  const contactUrl = contactId ? `https://contacts.google.com/person/${contactId}` : 'https://contacts.google.com';

  if (contact.currentYear && resourceName) {
    try {
      const groupResourceName = await findOrCreateContactGroup(contact.currentYear, token);
      await addContactToGroup(resourceName, groupResourceName, token);
    } catch (labelError) {
      // Non-fatal: the contact was created successfully, just missing its year label
      console.warn('Career Catalyst Background: Failed to label contact with year "' + contact.currentYear + '":', labelError);
    }
  }

  return { resourceName, contactUrl };
}

// Find a Google Contacts label (People API "contact group") matching the given name, creating it if needed
async function findOrCreateContactGroup(label, token) {
  const listResponse = await fetch('https://people.googleapis.com/v1/contactGroups?pageSize=1000', {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  if (listResponse.ok) {
    const listData = await listResponse.json();
    const existing = (listData.contactGroups || []).find(g => g.formattedName === label);
    if (existing) return existing.resourceName;
  }

  const createResponse = await fetch('https://people.googleapis.com/v1/contactGroups', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ contactGroup: { name: label } })
  });
  if (!createResponse.ok) {
    const errorData = await createResponse.json().catch(() => ({}));
    throw new Error(errorData.error?.message || `Failed to create contact label "${label}"`);
  }
  const createData = await createResponse.json();
  return createData.resourceName;
}

// Add a contact to a contact group (i.e. apply a Google Contacts label)
async function addContactToGroup(contactResourceName, groupResourceName, token) {
  const response = await fetch(`https://people.googleapis.com/v1/${groupResourceName}/members:modify`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ resourceNamesToAdd: [contactResourceName] })
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error?.message || `Failed to add contact to label "${groupResourceName}"`);
  }
}

// Handle creating a Google Contact via the People API for the LinkedIn "Get as Google Contact" action
async function handleCreateGoogleContact(request, sendResponse) {
  try {
    console.log('Career Catalyst Background: Creating Google contact via People API');
    const { firstName, lastName, email, linkedinUrl, currentYear } = request.contact || {};

    if (!firstName && !lastName) {
      sendResponse({ success: false, error: 'Contact name is required' });
      return;
    }

    const { contactUrl } = await createGooglePeopleContact({ firstName, lastName, email, linkedinUrl, currentYear });

    const tab = await chrome.tabs.create({ url: contactUrl });

    sendResponse({ success: true, contactUrl, tabId: tab.id });

  } catch (error) {
    console.error('Career Catalyst Background: Failed to create Google contact:', error);
    sendResponse({
      success: false,
      error: error.message || 'Failed to create Google contact'
    });
  }
}

console.log('Career Catalyst Assistant: Background script loaded');