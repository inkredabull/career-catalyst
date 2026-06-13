#!/usr/bin/env node

// Unified Server - Combines CLI server and MCP server functionality
const express = require('express');
const cors = require('cors');
const { execSync, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const Anthropic = require('@anthropic-ai/sdk');

// Load .env from project root (two levels up from packages/unified-server)
require('dotenv').config({ path: path.resolve(__dirname, '..', '..', '.env') });

const app = express();
const PORT = 3000; // Using port 3000 (was MCP server port)

// CV MCP Server functionality
class CVResponseEngine {
  constructor(useLLM = false) {
    this.useLLM = useLLM;
    this.anthropic = null;
    
    if (this.useLLM) {
      if (!process.env.ANTHROPIC_API_KEY) {
        console.error('WARNING: ANTHROPIC_API_KEY not found in environment variables');
        console.error('CV responses will use pattern-matching instead of Claude 3.5');
        this.useLLM = false;
      } else {
        this.anthropic = new Anthropic({
          apiKey: process.env.ANTHROPIC_API_KEY,
        });
        console.log('🧠 Claude 3.5 Sonnet LLM enabled for CV responses');
      }
    }
    
    if (!this.useLLM) {
      console.log('📝 Using pattern-matching for CV responses (set ANTHROPIC_API_KEY for Claude)');
    }
  }

  async answerCVQuestion(question, jobDescription = '', jobId = null) {
    console.log('  -> CVEngine.answerCVQuestion called');
    console.log('  -> Question length:', question.length, 'chars');
    console.log('  -> Job description length:', jobDescription ? jobDescription.length : 0, 'chars');
    console.log('  -> Job ID:', jobId || 'not provided');
    console.log('  -> LLM mode enabled:', this.useLLM ? 'Yes' : 'No');
    console.log('  -> Anthropic client initialized:', this.anthropic ? 'Yes' : 'No');
    console.log('  -> ANTHROPIC_API_KEY present:', process.env.ANTHROPIC_API_KEY ? 'Yes' : 'No');

    if (this.useLLM && this.anthropic) {
      console.log('  -> Decision: Using LLM for response (Claude Sonnet 4.5)');
      return this.answerWithLLM(question, jobDescription, jobId);
    } else {
      const reason = !this.useLLM ? 'useLLM=false (server not started with --llm flag)' : 'Anthropic client not initialized (missing API key)';
      console.log('  -> Decision: Using pattern matching for response');
      console.log('  -> Reason:', reason);
      return this.answerWithPatternMatching(question, jobDescription);
    }
  }

  async answerWithLLM(question, jobDescription = '', jobId = null) {
    try {
      const cvContent = this.loadCVContent();
      console.log('  -> CV content loaded:', cvContent.length, 'chars');

      if (jobDescription.trim()) {
        console.log('  -> Job description provided:', jobDescription.length, 'chars');
      } else {
        console.log('  -> No job description provided');
      }

      // Build context section with job information if available
      let contextSection = '';
      if (jobDescription.trim()) {
        contextSection = `\n\nJob Context:\n${jobDescription}\n`;
      }

      const prompt = `You are answering this interview question in first person. Use your CV below and the job context (if provided) to craft a response that connects your experience to this specific opportunity.

CV Information:
${cvContent}${contextSection}

Question: ${question}

CRITICAL REQUIREMENTS:
1. Length: 200-350 characters ONLY (strict limit)
2. Format: Plain text paragraph, NO markdown, NO bullet points, NO formatting
3. Content: Draw specific examples from CV with quantifiable results
4. Tone: Professional and confident
5. If job context is provided, connect your CV experience to the specific role/company
6. If no job context, answer generically based on CV

Response (200-350 chars, plain text only):`;

      console.log('  -> Total prompt length:', prompt.length, 'chars');

      // Write prompt to filesystem if job ID is provided
      if (jobId) {
        try {
          const projectDir = path.resolve(__dirname, '..', '..');
          const jobDir = path.join(projectDir, 'logs', jobId);

          // Create job directory if it doesn't exist
          if (!fs.existsSync(jobDir)) {
            fs.mkdirSync(jobDir, { recursive: true });
          }

          const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
          const promptFile = path.join(jobDir, `cv-prompt-${timestamp}.txt`);

          const promptContent = `CV Question Prompt
Generated: ${new Date().toISOString()}
Question: ${question}
Job ID: ${jobId}

${'='.repeat(80)}

${prompt}

${'='.repeat(80)}
`;

          fs.writeFileSync(promptFile, promptContent, 'utf-8');
          console.log('  -> Prompt saved to:', `logs/${jobId}/cv-prompt-${timestamp}.txt`);
        } catch (error) {
          console.error('  -> Error saving prompt to filesystem:', error.message);
        }
      } else {
        console.log('  -> Prompt NOT saved (no job ID provided)');
      }

      console.log('  -> Calling Claude API (model: claude-sonnet-4-5-20250929, max_tokens: 150)');

      const response = await this.anthropic.messages.create({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 150,
        temperature: 0.5,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ]
      });

      console.log('  -> Claude API response received');
      console.log('  -> Response length:', response.content[0].text.length, 'chars');
      console.log('  -> Tokens used:', response.usage?.input_tokens || 'N/A', 'input,', response.usage?.output_tokens || 'N/A', 'output');

      return {
        content: [{ text: response.content[0].text }]
      };
    } catch (error) {
      console.error('  -> LLM Error:', error);
      console.log('  -> Falling back to pattern matching');
      // Fallback to pattern matching
      return this.answerWithPatternMatching(question, jobDescription);
    }
  }

  answerWithPatternMatching(question, jobDescription = '') {
    console.log('  -> Pattern matching mode');
    const cvData = this.parseCV();
    console.log('  -> CV parsed - accomplishments:', cvData.accomplishments.length, ', strengths:', cvData.strengths.length);
    const questionType = this.classifyQuestion(question);
    console.log('  -> Question classified as:', questionType);

    // Increase job description context from 300 to 1500 characters for pattern matching
    const jobContext = jobDescription.trim() ? ` given this job opportunity: "${jobDescription.substring(0, 1500)}${jobDescription.length > 1500 ? '...' : ''}"` : '';
    console.log('  -> Job context created:', jobContext ? 'Yes (' + jobContext.length + ' chars)' : 'No');

    const responses = {
      experience: () => this.generateExperienceResponse(cvData, jobContext),
      skills: () => this.generateSkillsResponse(cvData, jobContext),
      leadership: () => this.generateLeadershipResponse(cvData, jobContext),
      technical: () => this.generateTechnicalResponse(cvData, jobContext),
      default: () => this.generateDefaultResponse(cvData, question, jobContext)
    };

    const responseText = responses[questionType]();
    console.log('  -> Pattern matching response generated:', responseText.length, 'chars');
    console.log('  -> Response preview:', responseText.substring(0, 150) + '...');
    console.log('  -> WARNING: Pattern matching responses are generic and do not consider job-specific context');
    console.log('  -> TIP: For job-specific responses, ensure unified server is started with --llm flag and ANTHROPIC_API_KEY is set');
    return {
      content: [{ text: responseText }]
    };
  }

  loadCVContent() {
    const projectRoot = path.resolve(__dirname, '..', '..');

    const possiblePaths = process.env.CV_PATH
      ? [process.env.CV_PATH, path.resolve(projectRoot, process.env.CV_PATH)]
      : [
          path.join(projectRoot, 'cv.txt'),
          path.join(projectRoot, 'CV.txt'),
          path.join(projectRoot, 'sample-cv.txt'),
          'cv.txt',
          './cv.txt',
          'CV.txt',
          './CV.txt',
          'sample-cv.txt',
          './sample-cv.txt'
        ];

    console.log('  -> Looking for CV file in:', process.env.CV_PATH || projectRoot);

    for (const cvPath of possiblePaths) {
      try {
        if (fs.existsSync(cvPath)) {
          const content = fs.readFileSync(cvPath, 'utf-8');
          console.log('  -> CV file found:', cvPath);
          console.log('  -> CV file size:', content.length, 'chars');
          return content;
        }
      } catch (error) {
        continue;
      }
    }

    console.warn('  -> WARNING: No CV file found, using fallback sample CV');
    
    // Return sample CV if none found
    return `KEY ACCOMPLISHMENTS

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
  }

  parseCV() {
    const content = this.loadCVContent();
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
        continue;
      } else if (!line.toUpperCase().includes('ACCOMPLISHMENTS') && !line.toUpperCase().includes('STRENGTHS')) {
        if (currentSection === 'accomplishments') {
          sections.accomplishments.push(line);
        } else if (currentSection === 'strengths') {
          sections.strengths.push(line.replace(/^\*\s*/, ''));
        } else if (currentSection === 'experience') {
          sections.experience.push(line);
        } else if (!sections.name && !line.includes('|') && !line.includes('@')) {
          sections.name = line;
        }
      }
    }
    
    return sections;
  }

  classifyQuestion(question) {
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

  generateExperienceResponse(cvData, jobContext = '') {
    const topAccomplishments = cvData.accomplishments.slice(0, 3);
    console.log('  -> Selecting top 3 accomplishments from', cvData.accomplishments.length, 'total');
    console.log('  -> Selected:', topAccomplishments.map((a, i) => `\n      ${i+1}. ${a.substring(0, 80)}...`).join(''));

    let response = `My experience includes ${topAccomplishments.join(', ').toLowerCase()}. These accomplishments demonstrate my ability to deliver measurable business impact across different organizations and technical challenges.`;

    if (jobContext) {
      response += ` This background is directly relevant to the opportunity described.`;
      console.log('  -> Added job context reference to response');
    }

    return response;
  }

  generateSkillsResponse(cvData, jobContext = '') {
    const topStrengths = cvData.strengths.slice(0, 4);
    console.log('  -> Selecting top 4 strengths from', cvData.strengths.length, 'total');
    console.log('  -> Selected:', topStrengths.map((s, i) => `\n      ${i+1}. ${s}`).join(''));

    let response = `My core strengths include ${topStrengths.join(', ').toLowerCase()}. I excel at combining technical leadership with strong communication and process optimization to drive results.`;

    if (jobContext) {
      response += ` These strengths align well with the role requirements.`;
      console.log('  -> Added job context reference to response');
    }

    return response;
  }

  generateLeadershipResponse(cvData, jobContext = '') {
    const leadershipKeywords = ['launched', 'drove', 'delivered', 'led', 'managed'];
    const leadershipAccomplishments = this.filterByKeywords(cvData.accomplishments, leadershipKeywords);
    const topLeadership = leadershipAccomplishments.length > 0 ? leadershipAccomplishments.slice(0, 2) : cvData.accomplishments.slice(0, 2);

    console.log('  -> Filtering for leadership keywords:', leadershipKeywords.join(', '));
    console.log('  -> Found', leadershipAccomplishments.length, 'leadership accomplishments from', cvData.accomplishments.length, 'total');
    console.log('  -> Selected:', topLeadership.map((a, i) => `\n      ${i+1}. ${a.substring(0, 80)}...`).join(''));

    let response = `My leadership experience demonstrates strong results through ${topLeadership.join(' and ').toLowerCase()}. I believe in hands-on technical leadership while empowering teams to own their implementations and grow their skills.`;

    if (jobContext) {
      response += ` This leadership approach would translate well to the described role.`;
      console.log('  -> Added job context reference to response');
    }

    return response;
  }

  generateTechnicalResponse(cvData, jobContext = '') {
    const techKeywords = ['ai', 'data', 'platform', 'technical', 'system', 'application'];
    const techAccomplishments = this.filterByKeywords(cvData.accomplishments, techKeywords);
    const topTech = techAccomplishments.length > 0 ? techAccomplishments.slice(0, 3) : cvData.accomplishments.slice(0, 3);

    console.log('  -> Filtering for technical keywords:', techKeywords.join(', '));
    console.log('  -> Found', techAccomplishments.length, 'technical accomplishments from', cvData.accomplishments.length, 'total');
    console.log('  -> Selected:', topTech.map((a, i) => `\n      ${i+1}. ${a.substring(0, 80)}...`).join(''));

    let response = `My technical background includes ${topTech.join(', ').toLowerCase()}. I combine deep technical expertise with business impact, focusing on scalable solutions that deliver measurable results.`;

    if (jobContext) {
      response += ` This technical foundation is relevant to the role's requirements.`;
      console.log('  -> Added job context reference to response');
    }

    return response;
  }

  generateDefaultResponse(cvData, question, jobContext = '') {
    const topAccomplishments = cvData.accomplishments.slice(0, 2);
    const topStrengths = cvData.strengths.slice(0, 3);

    console.log('  -> Generating default response (no specific question type match)');
    console.log('  -> Selected accomplishments:', topAccomplishments.map((a, i) => `\n      ${i+1}. ${a.substring(0, 80)}...`).join(''));
    console.log('  -> Selected strengths:', topStrengths.map((s, i) => `\n      ${i+1}. ${s}`).join(''));

    let response = `My background includes ${topAccomplishments.join(' and ').toLowerCase()}. My core strengths are ${topStrengths.join(', ').toLowerCase()}. This experience positions me well to tackle complex challenges and deliver measurable business impact.`;

    if (jobContext) {
      response += ` Based on the job opportunity, I believe my experience aligns well with the role requirements.`;
      console.log('  -> Added job context reference to response');
    }

    return response;
  }

  formatBulletList(items) {
    return items.map(item => `• ${item}`).join('\n');
  }

  filterByKeywords(items, keywords) {
    return items.filter(item => 
      keywords.some(keyword => item.toLowerCase().includes(keyword))
    );
  }

  extractExperienceAreas(accomplishments) {
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
}

// Initialize CV response engine
const cvEngine = new CVResponseEngine(process.argv.includes('--llm'));

// Enable CORS for Chrome extension, AMA app, and LinkedIn content scripts
app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true); // same-origin / curl
    if (
      origin.startsWith('chrome-extension://') ||
      origin.startsWith('http://localhost:') ||
      origin === 'https://www.linkedin.com' ||
      origin === 'https://linkedin.com'
    ) {
      return callback(null, true);
    }
    callback(new Error(`CORS: origin not allowed — ${origin}`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Increase body size limit to handle large HTML payloads from Chrome extension
// Job posting pages can be 1-5MB of HTML
app.use(express.json({ limit: '10mb' }));

// Health check endpoint
app.get('/health', (req, res) => {
  console.log(`[${new Date().toISOString()}] Health check request`);
  res.json({ 
    status: 'ok', 
    message: 'Unified server is running',
    services: ['CLI', 'MCP', 'CV'],
    llm: cvEngine.useLLM ? 'enabled' : 'disabled'
  });
});

// Helper function to log chats
function logChat(question, answer, metadata = {}) {
  try {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      question,
      answer,
      metadata,
      sessionId: metadata.sessionId || 'unknown'
    };
    
    // Create logs directory if it doesn't exist
    const logsDir = path.join(__dirname, 'logs', 'ama-chats');
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }
    
    // Create log filename with date
    const dateStr = timestamp.split('T')[0]; // YYYY-MM-DD
    const logFile = path.join(logsDir, `ama-chat-${dateStr}.jsonl`);
    
    // Append to JSONL file (one JSON object per line)
    const logLine = JSON.stringify(logEntry) + '\n';
    fs.appendFileSync(logFile, logLine, 'utf-8');
    
    console.log(`  -> Chat logged to: ${logFile}`);
  } catch (error) {
    console.error('  -> Error logging chat:', error.message);
  }
}

// CV Question endpoint (from MCP server)
app.post('/cv-question', async (req, res) => {
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`[${new Date().toISOString()}] CV question request`);
  try {
    const { question, jobDescription, jobId, sessionId, userAgent, referrer } = req.body;
    console.log('  -> Question:', question);
    console.log('  -> Question length:', question?.length || 0, 'chars');
    console.log('  -> Job ID:', jobId || 'not provided');
    console.log('  -> Job description provided:', jobDescription ? 'Yes' : 'No');
    console.log('  -> Job description length:', jobDescription?.length || 0, 'chars');

    if (jobDescription && jobDescription.length > 0) {
      console.log('  -> Job description preview:', jobDescription.substring(0, 200) + '...');
    } else {
      console.log('  -> WARNING: No job description - response will NOT be tailored');
    }

    if (!question) {
      console.log('  -> ERROR: No question provided');
      console.log('═══════════════════════════════════════════════════════════');
      return res.status(400).json({ error: 'Question parameter is required' });
    }

    console.log('  -> Calling CVEngine.answerCVQuestion...');
    const response = await cvEngine.answerCVQuestion(question, jobDescription, jobId);
    const answerText = response.content[0].text;
    console.log('  -> CV response generated');
    console.log('  -> Response length:', answerText.length, 'chars');
    console.log('  -> Response preview:', answerText.slice(0, 100) + '...');

    // Log the chat interaction
    logChat(question, answerText, {
      sessionId: sessionId || 'web-session-' + Date.now(),
      userAgent,
      referrer,
      jobDescription: jobDescription ? 'provided' : 'none',
      jobDescriptionLength: jobDescription?.length || 0,
      responseLength: answerText.length,
      source: 'ama-web-app'
    });
    
    const jsonResponse = {
      success: true,
      response: answerText
    };

    res.json(jsonResponse);
    console.log('  -> CV question response sent successfully');
    console.log('═══════════════════════════════════════════════════════════');
  } catch (error) {
    console.error('  -> CV question error:', error);
    console.log('═══════════════════════════════════════════════════════════');
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// GET /extract — email "Track" link handler
// Accepts a LinkedIn job URL as query param, fires extraction in background, returns HTML confirmation
app.get('/extract', (req, res) => {
  const { url } = req.query;
  if (!url || !url.includes('linkedin.com/jobs')) {
    return res.status(400).send('<p>Missing or invalid url parameter.</p>');
  }

  const safeUrl = url.replace(/"/g, '');
  res.send(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Tracking…</title></head>
<body style="font-family:sans-serif;padding:32px">
  <p>Tracking started for:</p>
  <p><a href="${safeUrl}">${safeUrl}</a></p>
  <p style="color:#888;font-size:13px">You can close this tab.</p>
</body></html>`);

  setImmediate(() => {
    const projectDir = path.resolve(__dirname, '..', '..');
    const command = `npx ts-node components/core/src/cli.ts extract "${safeUrl}" --skip-post-workflow`;
    try {
      console.log(`[GET /extract] Tracking: ${safeUrl}`);
      execSync(command, { cwd: projectDir, encoding: 'utf-8', timeout: 120000 });
      console.log(`[GET /extract] Done: ${safeUrl}`);
    } catch (err) {
      console.error(`[GET /extract] Failed: ${err.message}`);
    }
  });
});

// Extract endpoint (from CLI server)
app.post('/extract', async (req, res) => {
  console.log(`[${new Date().toISOString()}] Extract request`);
  try {
    const { url, type, data, html, reminderPriority, createReminders, selectedReminders } = req.body;

    // Handle different extraction types
    if (type === 'html') {
      // Handle HTML extraction - use robust CLI extraction logic
      if (!html) {
        return res.status(400).json({
          success: false,
          error: 'HTML content is required for HTML extraction'
        });
      }

      console.log(`  -> Processing HTML content (${html.length} chars)`);
      console.log(`  -> Source URL:`, url || 'unknown');
      console.log(`  -> Reminder priority:`, reminderPriority || 'default');

      // Change to the main project directory
      const projectDir = path.resolve(__dirname, '..', '..');
      process.chdir(projectDir);

      // Create a temporary HTML file with the page content
      const tempHtmlFile = path.join(projectDir, 'temp-job-extract.html');
      fs.writeFileSync(tempHtmlFile, html);

      try {
        // Execute the extract command using the temp HTML file
        console.log(`  -> Executing extract with HTML file: ${tempHtmlFile}`);

        const output = await new Promise((resolve, reject) => {
          const args = ['ts-node', 'components/core/src/cli.ts', 'extract', '--type', 'html'];
          if (reminderPriority) {
            args.push('--reminder-priority', reminderPriority.toString());
          }
          // Skip reminders unless explicitly requested (for preview/display extraction)
          if (!createReminders) {
            args.push('--no-reminders');
          }
          // Skip post-workflow for Chrome extension requests for immediate response
          args.push('--skip-post-workflow');
          args.push(tempHtmlFile);

          console.log(`  -> Command: npx ${args.join(' ')}`);

          const child = spawn('npx', args, {
            cwd: projectDir,
            stdio: ['pipe', 'pipe', 'pipe']
          });

          let stdout = '';
          let stderr = '';

          child.stdout.on('data', (data) => {
            stdout += data.toString();
          });

          child.stderr.on('data', (data) => {
            stderr += data.toString();
          });

          child.on('close', (code) => {
            if (code !== 0) {
              console.log(`  -> Command stderr: ${stderr}`);
              reject(new Error(stderr || `Command failed with code ${code}`));
            } else {
              resolve(stdout);
            }
          });
        });

        console.log(`  -> Command output: ${output}`);

        // Parse the output to extract job ID
        const jobIdMatch = output.match(/([a-f0-9]{8})\s*$/m);
        const jobId = jobIdMatch ? jobIdMatch[1] : null;

        if (!jobId) {
          console.log(`  -> ❌ Failed to extract job ID from output`);
          return res.status(500).json({
            success: false,
            error: 'Could not extract job ID from command output'
          });
        }

        console.log(`  -> ✅ Job extracted successfully with ID: ${jobId}`);

        // Try to read the job file to get processed job data
        let jobData = null;
        try {
          const jobDir = path.join(projectDir, 'logs', jobId);
          const jobFile = 'job-cache.json';
          const jobFilePath = path.join(jobDir, jobFile);
          jobData = fs.existsSync(jobFilePath) ? JSON.parse(fs.readFileSync(jobFilePath, 'utf-8')) : null;
          if (jobData) {
            console.log(`  -> 📄 Job data saved to: logs/${jobId}/${jobFile}`);
          }
        } catch (error) {
          console.log(`  -> ⚠️  Could not read processed job data: ${error.message}`);
        }

        res.json({
          success: true,
          jobId: jobId,
          filePath: `logs/${jobId}/`,
          jobData: jobData
        });

        console.log(`  -> 🎉 Response sent to Chrome extension`);

        // Async background processing for Medium/High priority jobs
        const priority = parseInt(reminderPriority) || 5;
        if (false && priority <= 5) { // scoring paused
          console.log(`  -> 🔄 Triggering async background scoring and resume generation for priority ${priority} job`);
          setImmediate(async () => {
            try {
              await triggerAsyncJobProcessing(jobId, priority, projectDir);
            } catch (error) {
              console.log(`  -> ❌ Background processing failed for job ${jobId}: ${error.message}`);
            }
          });
        } else {
          console.log(`  -> ⏭️  Skipping background processing for Low priority (${priority}) job`);
        }

      } finally {
        // Clean up temporary file
        try {
          fs.unlinkSync(tempHtmlFile);
        } catch (cleanupError) {
          console.log('  -> Could not clean up temp HTML file:', cleanupError.message);
        }
      }

    } else if (type === 'json') {
      // Handle JSON extraction
      if (!data) {
        return res.status(400).json({
          success: false,
          error: 'Job data is required for JSON extraction'
        });
      }
      
      console.log(`  -> Processing JSON data:`, data);
      console.log(`  -> Reminder priority:`, reminderPriority || 'default');
      
      // Change to the main project directory (two levels up from packages/unified-server)
      const projectDir = path.resolve(__dirname, '..', '..');
      process.chdir(projectDir);
      
      // Create a temporary JSON file with the job data
      const tempJsonFile = path.join(projectDir, 'temp-job-extract.json');
      fs.writeFileSync(tempJsonFile, JSON.stringify(data, null, 2));
      
      try {
        // Execute the extract command using the temp file path
        console.log(`  -> Executing extract with JSON file: ${tempJsonFile}`);
        
        const output = await new Promise((resolve, reject) => {
          const args = ['ts-node', 'components/core/src/cli.ts', 'extract', '--type', 'jsonfile'];
          if (reminderPriority) {
            args.push('--reminder-priority', reminderPriority.toString());
          }
          // Skip reminders unless explicitly requested (for preview/display extraction)
          if (!createReminders) {
            args.push('--no-reminders');
          }
          // Pass selected reminders if provided
          if (selectedReminders && selectedReminders.length > 0) {
            args.push('--selected-reminders', selectedReminders.join(','));
          }
          // Skip post-workflow (scoring, resume generation) for Chrome extension requests
          // This allows immediate response to the extension
          args.push('--skip-post-workflow');
          args.push(tempJsonFile);

          console.log(`  -> Command: npx ${args.join(' ')}`);

          const child = spawn('npx', args, {
            cwd: projectDir,
            stdio: ['pipe', 'pipe', 'pipe']
          });

          let stdout = '';
          let stderr = '';

          child.stdout.on('data', (data) => {
            const output = data.toString();
            stdout += output;
            // Log stdout in real-time with prefix
            output.split('\n').filter(line => line.trim()).forEach(line => {
              console.log(`     [CLI] ${line}`);
            });
          });

          child.stderr.on('data', (data) => {
            const output = data.toString();
            stderr += output;
            // Log stderr in real-time with prefix (errors/warnings)
            output.split('\n').filter(line => line.trim()).forEach(line => {
              console.log(`     [CLI:err] ${line}`);
            });
          });

          child.on('close', (code) => {
            console.log(`  -> Command finished with exit code ${code}`);

            if (code === 0) {
              resolve(stdout);
            } else {
              console.log(`  -> Command failed. Full stderr: ${stderr}`);
              reject(new Error(`Command failed with code ${code}: ${stderr}`));
            }
          });

          // Set timeout — 120s to accommodate LLM classification + AppleScript reminder creation
          setTimeout(() => {
            child.kill();
            reject(new Error('Command timed out after 120 seconds'));
          }, 120000);
        });
        
        // Parse the output to extract job ID
        const jobIdMatch = output.match(/([a-f0-9]{8})\s*$/m);
        const jobId = jobIdMatch ? jobIdMatch[1] : null;

        if (!jobId) {
          console.log(`  -> ❌ Failed to extract job ID from output`);
          return res.status(500).json({
            success: false,
            error: 'Could not extract job ID from command output'
          });
        }

        console.log(`  -> ✅ Job extracted successfully with ID: ${jobId}`);
        
        // Try to read the job file to get processed job data
        let jobData = null;
        try {
          const jobDir = path.join(projectDir, 'logs', jobId);
          const jobFile = 'job-cache.json';
          const jobFilePath = path.join(jobDir, jobFile);
          jobData = fs.existsSync(jobFilePath) ? JSON.parse(fs.readFileSync(jobFilePath, 'utf-8')) : null;
          if (jobData) {
            console.log(`  -> 📄 Job data saved to: logs/${jobId}/${jobFile}`);
          }
        } catch (error) {
          console.log(`  -> ⚠️  Could not read processed job data: ${error.message}`);
        }

        res.json({
          success: true,
          jobId: jobId,
          filePath: `logs/${jobId}/`,
          jobData: jobData || data // Return original data if processed data not available
        });

        console.log(`  -> 🎉 Response sent to Chrome extension`);

        // Async background processing for Medium/High priority jobs
        // Priority: 1=High, 5=Medium, 9=Low
        const priority = parseInt(reminderPriority) || 5;
        if (false && priority <= 5) { // scoring/resume generation paused
          console.log(`  -> 🔄 Triggering async background scoring and resume generation for priority ${priority} job`);
          setImmediate(async () => {
            try {
              await triggerAsyncJobProcessing(jobId, priority, projectDir);
            } catch (error) {
              console.log(`  -> ❌ Background processing failed for job ${jobId}: ${error.message}`);
            }
          });
        } else {
          console.log(`  -> ⏭️  Skipping background processing for Low priority (${priority}) job`);
        }
        
      } finally {
        // Clean up temporary file
        try {
          fs.unlinkSync(tempJsonFile);
        } catch (cleanupError) {
          console.log('  -> Could not clean up temp JSON file:', cleanupError.message);
        }
      }
      
    } else {
      // Handle URL extraction (existing behavior)
      if (!url) {
        return res.status(400).json({
          success: false,
          error: 'URL is required for URL extraction'
        });
      }
      
      console.log(`  -> Extracting job from URL: ${url}`);

      // Change to the main project directory (two levels up from packages/unified-server)
      const projectDir = path.resolve(__dirname, '..', '..');
      process.chdir(projectDir);

      // Build extract command with optional flags
      let command = `npx ts-node components/core/src/cli.ts extract "${url}"`;
      if (reminderPriority) {
        command += ` --reminder-priority ${reminderPriority}`;
      }
      // Skip reminders unless explicitly requested (for preview/display extraction)
      if (!createReminders) {
        command += ' --no-reminders';
      }
      command += ' --skip-post-workflow';

      console.log(`  -> Executing command: ${command}`);
      
      const output = execSync(command, {
        encoding: 'utf-8',
        timeout: 120000, // 2 minute timeout for slow websites and LLM processing
        cwd: projectDir
      });
      
      console.log(`  -> Command output: ${output}`);
      
      // Parse the output to extract job ID and other information
      const jobIdMatch = output.match(/([a-f0-9]{8})\s*$/m);
      const jobId = jobIdMatch ? jobIdMatch[1] : null;
      
      if (!jobId) {
        return res.status(500).json({
          success: false,
          error: 'Could not extract job ID from command output'
        });
      }
      
      // Try to read the job file to get job data
      let jobData = null;
      try {
        const jobDir = path.join(projectDir, 'logs', jobId);
        const files = fs.readdirSync(jobDir);
        const jobFile = files.find(file => file.startsWith('job-') && file.endsWith('.json'));
        
        if (jobFile) {
          const jobFilePath = path.join(jobDir, jobFile);
          const jobDataRaw = fs.readFileSync(jobFilePath, 'utf-8');
          jobData = JSON.parse(jobDataRaw);
        }
      } catch (error) {
        console.log('  -> Could not read job data:', error.message);
      }
      
      res.json({
        success: true,
        jobId: jobId,
        filePath: `logs/${jobId}/`,
        jobData: jobData
      });
    }
    
  } catch (error) {
    console.error('  -> Extract failed:', error);
    
    let errorMessage = error.message;
    if (error.message.includes('TIMEOUT')) {
      errorMessage = 'Extraction timed out - job sites may take a while to process';
    } else if (error.message.includes('competition')) {
      errorMessage = 'Job skipped due to high competition (too many applicants)';
    }
    
    res.status(500).json({
      success: false,
      error: errorMessage
    });
  }
});

// Load job from logs endpoint
app.post('/load-job', async (req, res) => {
  console.log(`[${new Date().toISOString()}] Load job from logs request`);
  try {
    const { jobId } = req.body;

    if (!jobId) {
      return res.status(400).json({
        success: false,
        error: 'Job ID is required'
      });
    }

    console.log(`  -> Loading job ${jobId} from logs`);

    // Change to the main project directory
    const projectDir = path.resolve(__dirname, '..', '..');
    const jobDir = path.join(projectDir, 'logs', jobId);

    // Check if job directory exists
    if (!fs.existsSync(jobDir)) {
      console.log(`  -> ❌ Job directory not found: ${jobDir}`);
      return res.status(404).json({
        success: false,
        error: `Job ${jobId} not found in logs`
      });
    }

    // Find the job JSON file (prefer job-cache.json, fall back to legacy job-*.json)
    const jobCacheFilePath = path.join(jobDir, 'job-cache.json');
    let jobFile = 'job-cache.json';
    let jobFilePath = jobCacheFilePath;
    if (!fs.existsSync(jobCacheFilePath)) {
      const files = fs.readdirSync(jobDir);
      const legacyFile = files.find(file => file.startsWith('job-') && file.endsWith('.json'));
      if (!legacyFile) {
        console.log(`  -> ❌ No job file found in directory`);
        return res.status(404).json({
          success: false,
          error: `No job data file found for ${jobId}`
        });
      }
      jobFile = legacyFile;
      jobFilePath = path.join(jobDir, jobFile);
    }

    // Read and parse the job data
    const jobDataRaw = fs.readFileSync(jobFilePath, 'utf-8');
    const jobData = JSON.parse(jobDataRaw);

    console.log(`  -> ✅ Successfully loaded job data from ${jobFile}`);

    res.json({
      success: true,
      jobData: jobData,
      filePath: `logs/${jobId}/${jobFile}`
    });

  } catch (error) {
    console.error('  -> Failed to load job from logs:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Teal tracking endpoint (legacy - now handled by Chrome extension)
app.post('/teal-track', async (req, res) => {
  console.log(`[${new Date().toISOString()}] Teal track request (deprecated)`);
  res.status(400).json({
    success: false,
    error: 'Teal automation is now handled by the Chrome extension. Use the Track button in the extension panel.'
  });
});

// LinkedIn post reminder creation endpoint
app.post('/linkedin-reminder', async (req, res) => {
  console.log(`[${new Date().toISOString()}] LinkedIn reminder creation request`);
  const { title, notes, priority = 5, dueDate = null, listName = 'LinkedIn Saved Posts' } = req.body;
  
  if (!title) {
    return res.status(400).json({
      success: false,
      error: 'Title is required for reminder creation'
    });
  }
  
  console.log(`  -> Creating reminder: ${title.substring(0, 50)}...`);
  
  try {
    // Change to the main project directory (two levels up from packages/unified-server)
    const projectDir = path.resolve(__dirname, '..', '..');
    
    // Use the MacOS reminder creation via CLI
    const output = await new Promise((resolve, reject) => {
      const args = ['ts-node', 'components/core/src/cli.ts', 'reminder'];
      
      // Add title (required)
      args.push('--title', title);
      
      // Add notes if provided
      if (notes) {
        args.push('--notes', notes);
      }
      
      // Add priority
      args.push('--priority', priority.toString());
      
      // Add list name
      args.push('--list', listName);
      
      // Add due date if provided
      if (dueDate) {
        args.push('--due', dueDate);
      }
      
      console.log(`  -> Running command: npx ${args.join(' ')}`);
      
      const child = spawn('npx', args, {
        cwd: projectDir,
        stdio: ['pipe', 'pipe', 'pipe']
      });
      
      let stdout = '';
      let stderr = '';
      
      child.stdout.on('data', (data) => {
        stdout += data;
      });
      
      child.stderr.on('data', (data) => {
        stderr += data;
      });
      
      child.on('close', (code) => {
        console.log(`  -> Command finished with code ${code}`);
        console.log(`  -> STDOUT: ${stdout}`);
        console.log(`  -> STDERR: ${stderr}`);
        
        if (code === 0) {
          resolve(stdout);
        } else {
          reject(new Error(`Reminder creation failed with code ${code}: ${stderr}`));
        }
      });
      
      // Set timeout
      setTimeout(() => {
        child.kill();
        reject(new Error('Reminder creation timed out after 10 seconds'));
      }, 10000);
    });
    
    console.log(`  -> Reminder created successfully`);
    
    res.json({
      success: true,
      reminderId: 'created',
      message: 'LinkedIn post reminder created successfully'
    });
    
  } catch (error) {
    console.error(`  -> Reminder creation failed: ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Generate third-person blurb endpoint
app.post('/generate-blurb', async (req, res) => {
  console.log(`[${new Date().toISOString()}] Generate blurb request`);
  try {
    const { jobId, companyWebsite, person, fromBlurb } = req.body;

    if (!jobId) {
      return res.status(400).json({
        success: false,
        error: 'Job ID is required'
      });
    }

    const perspective = person || 'third';
    console.log(`  -> Generating ${perspective}-person blurb for job: ${jobId}`);
    if (companyWebsite) {
      console.log(`  -> Using company website: ${companyWebsite}`);
    }

    // Fast-path: convert existing third-person blurb to first-person via direct LLM call
    if (perspective === 'first' && fromBlurb) {
      console.log(`  -> Converting third-person blurb to first-person (${fromBlurb.length} chars)`);
      const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      const conversionPrompt = `Convert the following third-person professional blurb into first-person by replacing all third-person references (Anthony, he, his, him) with first-person equivalents (I, my, me) and updating verbs accordingly. Preserve the exact meaning, tone, and structure. Output ONLY the converted text — no explanation, no quotes, no preamble.

Third-person blurb:
${fromBlurb}`;

      const message = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 300,
        messages: [{ role: 'user', content: conversionPrompt }]
      });

      let blurb = message.content[0].text.trim();
      blurb = blurb.replace(/—/g, '-').replace(/\s+--\s+/g, ' - ');

      // Save to prep dir
      const projectDir = path.resolve(__dirname, '..', '..');
      const jobDir = path.join(projectDir, 'logs', jobId);
      const prepDir = path.join(jobDir, 'prep');
      if (!fs.existsSync(prepDir)) fs.mkdirSync(prepDir, { recursive: true });
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      fs.writeFileSync(path.join(prepDir, `blurb-first-${timestamp}.txt`), blurb, 'utf-8');
      console.log(`  -> ✅ First-person blurb converted (${blurb.length} characters)`);

      return res.json({ success: true, jobId, blurb, characterCount: blurb.length });
    }

    // Change to the main project directory
    const projectDir = path.resolve(__dirname, '..', '..');
    process.chdir(projectDir);

    // Verify job exists
    const jobDir = path.join(projectDir, 'logs', jobId);
    if (!fs.existsSync(jobDir)) {
      return res.status(404).json({
        success: false,
        error: `Job ID ${jobId} not found`
      });
    }

    const output = await new Promise((resolve, reject) => {
      const args = ['run', 'dev', '--workspace=@inkredabull/career-catalyst-prep', '--', 'prep', 'cover-letter', jobId, '--person', perspective, '--content', '--regen'];

      // Add company URL if provided
      if (companyWebsite) {
        args.push('--company-url', companyWebsite);
      }

      console.log(`  -> Command: npm ${args.join(' ')}`);

      const child = spawn('npm', args, {
        cwd: projectDir,
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (data) => {
        const output = data.toString();
        stdout += output;
        // Log stdout in real-time with prefix
        output.split('\n').filter(line => line.trim()).forEach(line => {
          console.log(`     [BLURB] ${line}`);
        });
      });

      child.stderr.on('data', (data) => {
        const output = data.toString();
        stderr += output;
        // Log stderr in real-time with prefix (errors/warnings)
        output.split('\n').filter(line => line.trim()).forEach(line => {
          console.log(`     [BLURB:err] ${line}`);
        });
      });

      child.on('close', (code) => {
        console.log(`  -> Command finished with exit code ${code}`);

        if (code === 0) {
          resolve(stdout);
        } else {
          console.log(`  -> Command failed. Full stderr: ${stderr}`);
          reject(new Error(`Command failed with code ${code}: ${stderr}`));
        }
      });

      // Set timeout (cover letter generation with LLM calls can take 2-3 minutes)
      setTimeout(() => {
        child.kill();
        reject(new Error('Command timed out after 180 seconds'));
      }, 180000);
    });

    // The output contains CLI logs + actual content
    // With --content flag, the actual content is output after all the logging
    // Extract only the content part (after the last emoji/arrow line)
    const lines = output.split('\n');

    // Find where the actual content starts (after the last line with emoji/logging markers)
    let contentStartIndex = 0;
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i];
      // Skip empty lines
      if (!line.trim()) continue;

      // If line contains logging markers, content starts after this
      if (line.includes('📝') || line.includes('✅') || line.includes('🤖') ||
          line.includes('📄') || line.includes('->') || line.includes('📋') ||
          line.includes('🔍') || line.includes('🌐')) {
        contentStartIndex = i + 1;
        break;
      }
    }

    // Extract the actual content
    let blurb = lines.slice(contentStartIndex).join('\n').trim();

    // Remove em dashes (— or --) from the output
    blurb = blurb.replace(/—/g, '-').replace(/\s+--\s+/g, ' - ');

    if (!blurb) {
      return res.status(500).json({
        success: false,
        error: 'No blurb content generated'
      });
    }

    console.log(`  -> ✅ Blurb generated successfully (${blurb.length} characters)`);

    res.json({
      success: true,
      jobId: jobId,
      blurb: blurb,
      characterCount: blurb.length
    });

  } catch (error) {
    console.error('  -> Blurb generation failed:', error);

    let errorMessage = error.message;
    if (error.message.includes('timeout')) {
      errorMessage = 'Blurb generation timed out - this can take up to 3 minutes for complex jobs';
    }

    res.status(500).json({
      success: false,
      error: errorMessage
    });
  }
});

// Generate scoring report
app.post('/generate-score', async (req, res) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] Generate score request`);

  try {
    const { jobId } = req.body;

    if (!jobId) {
      return res.status(400).json({
        success: false,
        error: 'Job ID is required'
      });
    }

    console.log(`  -> Generating score for job: ${jobId}`);

    // Change to the main project directory (two levels up from packages/unified-server)
    const projectDir = path.resolve(__dirname, '..', '..');

    // Run the CLI score command
    const output = await new Promise((resolve, reject) => {
      const args = ['run', 'dev', '--workspace=@inkredabull/career-catalyst-core', '--', 'score', jobId];

      console.log(`  -> Executing: npm ${args.join(' ')}`);

      const scoreProcess = spawn('npm', args, {
        cwd: projectDir,
        shell: true
      });

      let stdout = '';
      let stderr = '';

      scoreProcess.stdout.on('data', (data) => {
        stdout += data.toString();
        console.log(`  -> ${data.toString().trim()}`);
      });

      scoreProcess.stderr.on('data', (data) => {
        stderr += data.toString();
        console.error(`  -> ERROR: ${data.toString().trim()}`);
      });

      scoreProcess.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`Score generation failed with code ${code}: ${stderr}`));
        } else {
          resolve({ stdout, stderr });
        }
      });

      scoreProcess.on('error', (error) => {
        reject(error);
      });
    });

    console.log(`  -> ✅ Score generated successfully`);

    res.json({
      success: true,
      jobId: jobId
    });

  } catch (error) {
    console.error('  -> Score generation failed:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get scoring report HTML
app.get('/report/:jobId', (req, res) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] Scoring report request for job: ${req.params.jobId}`);

  try {
    const { jobId } = req.params;

    if (!jobId) {
      return res.status(400).json({
        success: false,
        error: 'Job ID is required'
      });
    }

    // Change to the main project directory (two levels up from packages/unified-server)
    const projectDir = path.resolve(__dirname, '..', '..');
    const jobDir = path.join(projectDir, 'logs', jobId);

    if (!fs.existsSync(jobDir)) {
      return res.status(404).json({
        success: false,
        error: `Job ID ${jobId} not found`
      });
    }

    // Find the most recent score report HTML file
    const files = fs.readdirSync(jobDir);
    const reportFiles = files.filter(f => f.startsWith('score-report-') && f.endsWith('.html'));

    if (reportFiles.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'No scoring report found for this job. Score the job first.'
      });
    }

    // Sort by filename (timestamp) and get the most recent
    reportFiles.sort().reverse();
    const reportPath = path.join(jobDir, reportFiles[0]);

    console.log(`  -> Serving report: ${reportFiles[0]}`);

    // Read and serve the HTML file
    const htmlContent = fs.readFileSync(reportPath, 'utf-8');
    res.setHeader('Content-Type', 'text/html');
    res.send(htmlContent);

  } catch (error) {
    console.error('  -> Report retrieval failed:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Check if resume exists for a job
app.get('/check-resume/:jobId', (req, res) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] Check resume request for job: ${req.params.jobId}`);

  try {
    const { jobId } = req.params;

    if (!jobId) {
      return res.status(400).json({
        success: false,
        error: 'Job ID is required'
      });
    }

    // Change to the main project directory
    const projectDir = path.resolve(__dirname, '..', '..');
    const jobDir = path.join(projectDir, 'logs', jobId);

    if (!fs.existsSync(jobDir)) {
      return res.status(404).json({
        success: false,
        error: `Job ID ${jobId} not found`
      });
    }

    // Look for tailored resume files — check resume/ subdir first, then flat dir for legacy
    const resumeSubDir = path.join(jobDir, 'resume');
    const resumeScanDir = fs.existsSync(resumeSubDir) ? resumeSubDir : jobDir;
    const resumeScanFiles = fs.readdirSync(resumeScanDir);
    const resumeFiles = resumeScanFiles.filter(f => f.startsWith('tailored-') && f.endsWith('.md'));
    const resumeRelBase = fs.existsSync(resumeSubDir) ? `logs/${jobId}/resume` : `logs/${jobId}`;

    // Check for Google Drive URL in job cache or legacy job JSON
    let driveUrl = null;
    const cacheFile = path.join(jobDir, 'job-cache.json');
    const legacyFiles = fs.readdirSync(jobDir).filter(f => f.startsWith('job-') && f.endsWith('.json'));
    const jobFileToRead = fs.existsSync(cacheFile) ? cacheFile
      : (legacyFiles.length > 0 ? path.join(jobDir, legacyFiles.sort().reverse()[0]) : null);
    if (jobFileToRead) {
      try {
        const jobData = JSON.parse(fs.readFileSync(jobFileToRead, 'utf-8'));
        const candidate = jobData.resumeUrl || jobData.resumeGoogleDriveUrl || null;
        driveUrl = (candidate && candidate.includes('drive.google.com')) ? candidate : null;
        console.log(`  -> Drive URL from job JSON: ${driveUrl || 'not set'}`);
      } catch (error) {
        console.log(`  -> Could not read Drive URL from job JSON: ${error.message}`);
      }
    } else {
      console.log(`  -> No job JSON file found in ${jobDir}`);
    }

    if (resumeFiles.length === 0) {
      return res.json({
        success: true,
        exists: false,
        resumePath: null,
        driveUrl: driveUrl
      });
    }

    // Get the most recent resume file
    const mostRecentResume = resumeFiles.sort().reverse()[0];
    const relativePath = `${resumeRelBase}/${mostRecentResume}`;

    console.log(`  -> Resume found: ${relativePath}`);

    res.json({
      success: true,
      exists: true,
      resumePath: relativePath,
      driveUrl: driveUrl
    });

  } catch (error) {
    console.error('  -> Check resume failed:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Check if blurb exists for a job and person
app.get('/check-blurb/:jobId/:person', (req, res) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] Check blurb request for job: ${req.params.jobId}, person: ${req.params.person}`);

  try {
    const { jobId, person } = req.params;

    if (!jobId || !person) {
      return res.status(400).json({
        success: false,
        error: 'Job ID and person are required'
      });
    }

    if (person !== 'first' && person !== 'third') {
      return res.status(400).json({
        success: false,
        error: 'Person must be "first" or "third"'
      });
    }

    // Change to the main project directory
    const projectDir = path.resolve(__dirname, '..', '..');
    const jobDir = path.join(projectDir, 'logs', jobId);

    if (!fs.existsSync(jobDir)) {
      return res.status(404).json({
        success: false,
        error: `Job ID ${jobId} not found`
      });
    }

    // Look for blurb files — check prep/ subdir first, then flat dir for legacy
    const blurbPrepDir = path.join(jobDir, 'prep');
    const blurbScanDir = fs.existsSync(blurbPrepDir) ? blurbPrepDir : jobDir;
    const blurbScanFiles = fs.readdirSync(blurbScanDir);
    const blurbFiles = blurbScanFiles.filter(f => f.startsWith(`blurb-${person}-`) && f.endsWith('.txt'));

    if (blurbFiles.length === 0) {
      return res.json({
        success: true,
        exists: false,
        blurbContent: null
      });
    }

    // Get the most recent blurb file
    const mostRecentBlurb = blurbFiles.sort().reverse()[0];
    const blurbPath = path.join(blurbScanDir, mostRecentBlurb);
    const blurbContent = fs.readFileSync(blurbPath, 'utf-8');

    console.log(`  -> Blurb found: ${mostRecentBlurb} (${blurbContent.length} characters)`);

    res.json({
      success: true,
      exists: true,
      blurbContent: blurbContent
    });

  } catch (error) {
    console.error('  -> Check blurb failed:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Append mutual connections rows to Google Sheet
app.post('/append-mutual-connections', async (req, res) => {
  const { rows } = req.body;
  if (!rows || !Array.isArray(rows) || rows.length === 0) {
    return res.status(400).json({ success: false, error: 'rows array required' });
  }

  const spreadsheetId = process.env.MUTUAL_CONNECTIONS_SPREADSHEET_ID;
  const sheetName     = process.env.MUTUAL_CONNECTIONS_SHEET_NAME;

  if (!spreadsheetId || !sheetName) {
    return res.status(500).json({ success: false, error: 'MUTUAL_CONNECTIONS_SPREADSHEET_ID or MUTUAL_CONNECTIONS_SHEET_NAME not configured' });
  }

  let credentials;
  try {
    credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
  } catch {
    return res.status(500).json({ success: false, error: 'GOOGLE_SERVICE_ACCOUNT_JSON is missing or invalid JSON' });
  }

  try {
    const { google } = require('googleapis');
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets']
    });
    const sheets = google.sheets({ version: 'v4', auth });

    // Column order: Full Name | PersonName | PersonURL | Lookup | Zeitgeisty | Email Sent | Recipient | Cell | LinkedIn | C | JobID
    const values = rows.map(r => [
      r.fullName    || '',
      r.personName  || '',
      r.personUrl   || '',
      '',                    // Lookup
      '',                    // Zeitgeisty
      '',                    // Email Sent
      '',                    // Recipient
      '',                    // Cell
      r.linkedInUrl || '',
      '',                    // C
      r.jobId       || ''
    ]);

    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${sheetName}!A1`,
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values }
    });

    console.log(`[append-mutual-connections] Appended ${rows.length} row(s) to "${sheetName}"`);
    res.json({ success: true, appended: rows.length });
  } catch (err) {
    console.error('[append-mutual-connections] Error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Generate resume for a job
app.post('/generate-resume', async (req, res) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] Generate resume request`);

  try {
    const { jobId } = req.body;

    if (!jobId) {
      return res.status(400).json({
        success: false,
        error: 'Job ID is required'
      });
    }

    console.log(`  -> Generating resume for job: ${jobId}`);

    // Change to the main project directory
    const projectDir = path.resolve(__dirname, '..', '..');

    // Fire-and-forget: respond immediately so the extension doesn't time out waiting.
    // Resume generation (multi-model parallel pipeline) can take 5-10+ minutes.
    res.json({
      success: true,
      jobId: jobId,
      status: 'generating'
    });

    // Spawn the CLI process in the background after responding
    const args = ['run', 'dev', '--workspace=@inkredabull/career-catalyst-core', '--', 'resume', jobId];
    console.log(`  -> Executing: npm ${args.join(' ')}`);

    const resumeProcess = spawn('npm', args, {
      cwd: projectDir,
      shell: true,
      detached: false
    });

    resumeProcess.stdout.on('data', (data) => {
      data.toString().split('\n').filter(line => line.trim()).forEach(line => {
        console.log(`     [RESUME] ${line}`);
      });
    });

    resumeProcess.stderr.on('data', (data) => {
      data.toString().split('\n').filter(line => line.trim()).forEach(line => {
        console.error(`     [RESUME ERR] ${line}`);
      });
    });

    resumeProcess.on('close', (code) => {
      if (code === 0) {
        console.log(`  -> ✅ Resume generation complete for job: ${jobId}`);
      } else {
        console.error(`  -> ❌ Resume generation failed for job: ${jobId} (exit code ${code})`);
      }
    });

  } catch (error) {
    console.error('  -> Resume generation failed:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Save Google Drive resume URL to job JSON
app.post('/save-resume-drive-url', (req, res) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] Save resume Drive URL request`);

  try {
    const { jobId, driveUrl } = req.body;

    if (!jobId || !driveUrl) {
      return res.status(400).json({
        success: false,
        error: 'Job ID and Drive URL are required'
      });
    }

    console.log(`  -> Saving Drive URL for job: ${jobId}`);

    // Change to the main project directory
    const projectDir = path.resolve(__dirname, '..', '..');
    const jobDir = path.join(projectDir, 'logs', jobId);

    if (!fs.existsSync(jobDir)) {
      return res.status(404).json({
        success: false,
        error: `Job directory not found for ID: ${jobId}`
      });
    }

    // Find the job JSON file (it has a timestamp, not the job ID)
    const files = fs.readdirSync(jobDir);
    const jobFiles = files.filter(f => f.startsWith('job-') && f.endsWith('.json'));

    if (jobFiles.length === 0) {
      return res.status(404).json({
        success: false,
        error: `Job file not found for ID: ${jobId}`
      });
    }

    // Use the most recent job file
    const jobFile = path.join(jobDir, jobFiles.sort().reverse()[0]);

    // Read existing job JSON
    const jobData = JSON.parse(fs.readFileSync(jobFile, 'utf-8'));

    // Add or update the resume URL
    jobData.resumeUrl = driveUrl;
    jobData.updatedAt = new Date().toISOString();

    // Write back to file
    fs.writeFileSync(jobFile, JSON.stringify(jobData, null, 2));

    console.log(`  -> ✅ Drive URL saved successfully for job: ${jobId}`);

    res.json({
      success: true,
      jobId: jobId
    });

  } catch (error) {
    console.error('  -> Save Drive URL failed:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Job info lookup endpoint - returns structured job metadata from logs
// GET /llm?jobID=<id>  or  POST /llm { jobID: '<id>' }
app.all('/llm', (req, res) => {
  const timestamp = new Date().toISOString();
  const jobId = req.query.jobID || req.query.jobId || (req.body && (req.body.jobID || req.body.jobId));

  console.log(`[${timestamp}] /llm request - jobID: ${jobId}`);

  if (!jobId) {
    return res.status(400).json({
      success: false,
      error: 'jobID query parameter is required'
    });
  }

  try {
    const projectDir = path.resolve(__dirname, '..', '..');

    // Search candidate log directories in priority order
    const candidateDirs = [
      path.join(projectDir, 'logs', jobId),
      path.join(projectDir, 'components', 'core', 'logs', jobId),
      path.join(projectDir, 'packages', 'core', 'logs', jobId),
    ];

    let jobDir = null;
    for (const dir of candidateDirs) {
      if (fs.existsSync(dir)) {
        jobDir = dir;
        console.log(`  -> Found job directory: ${dir}`);
        break;
      }
    }

    if (!jobDir) {
      return res.status(404).json({
        success: false,
        error: `Job ID "${jobId}" not found in any logs directory`
      });
    }

    const files = fs.readdirSync(jobDir);

    // --- Read job data (job-cache.json first, then legacy job-*.json) ---
    const reportCacheFile = path.join(jobDir, 'job-cache.json');
    const reportLegacyFiles = files.filter(f => f.startsWith('job-') && f.endsWith('.json')).sort().reverse();
    const reportJobFile = fs.existsSync(reportCacheFile) ? reportCacheFile
      : (reportLegacyFiles.length > 0 ? path.join(jobDir, reportLegacyFiles[0]) : null);

    if (!reportJobFile) {
      return res.status(404).json({
        success: false,
        error: `No job data found in logs/${jobId}`
      });
    }

    const jobData = JSON.parse(fs.readFileSync(reportJobFile, 'utf-8'));
    console.log(`  -> Read job file: ${path.basename(reportJobFile)}`);

    const jobTitle = jobData.title || jobData.job_title || jobData.position || jobData.role || '';
    const company  = jobData.company || jobData.company_name || jobData.employer || '';
    const jobURL   = jobData.url || jobData.jobUrl || jobData.sourceUrl || jobData.job_url || null;

    // Use titleShorthand from job data if it exists, otherwise null
    const jobTitleShorthand = jobData.titleShorthand || null;

    if (jobTitleShorthand) {
      console.log(`  -> Using titleShorthand from job data: "${jobTitleShorthand}"`);
    } else {
      console.log(`  -> No titleShorthand found in job data`);
    }

    // --- Read most recent third-person blurb (check prep/ subdir first) ---
    const reportPrepDir = path.join(jobDir, 'prep');
    const reportBlurbScanDir = fs.existsSync(reportPrepDir) ? reportPrepDir : jobDir;
    const reportBlurbFiles = fs.readdirSync(reportBlurbScanDir)
      .filter(f => f.startsWith('blurb-third-') && f.endsWith('.txt'))
      .sort()
      .reverse();

    let thirdPersonBlurb = null;
    if (reportBlurbFiles.length > 0) {
      thirdPersonBlurb = fs.readFileSync(path.join(reportBlurbScanDir, reportBlurbFiles[0]), 'utf-8').trim();
      console.log(`  -> Read blurb file: ${reportBlurbFiles[0]} (${thirdPersonBlurb.length} chars)`);
    } else {
      console.log('  -> No third-person blurb file found');
    }

    // --- Extract resume URL from job data ---
    // resumeUrl holds the Drive URL; fall back to legacy resumeGoogleDriveUrl field
    const resumeURLCandidate = jobData.resumeUrl || jobData.resumeGoogleDriveUrl || null;
    const resumeURL = (resumeURLCandidate && resumeURLCandidate.includes('drive.google.com')) ? resumeURLCandidate : null;
    if (resumeURL) {
      console.log(`  -> Resume URL found: ${resumeURL}`);
    }

    console.log(`  -> ✅ Returning job info for: "${jobTitle}" at "${company}"`);

    return res.json({
      success: true,
      jobID: jobId,
      jobTitle: jobTitle,
      jobURL: jobURL,
      resumeURL: resumeURL,
      Company: company,
      jobTitleShorthand: jobTitleShorthand,
      'third-person-blurb': thirdPersonBlurb
    });

  } catch (error) {
    console.error('  -> /llm lookup failed:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Start server
app.listen(PORT, () => {
  console.log('🚀 Unified Career Catalyst Server');
  console.log('=' .repeat(50));
  console.log(`🌐 Server running on http://localhost:${PORT}`);
  console.log(`🧠 LLM mode: ${cvEngine.useLLM ? 'ENABLED (Claude Sonnet 4.5)' : 'DISABLED (Pattern matching)'}`);
  console.log('');
  console.log('📋 Available endpoints:');
  console.log(`  • GET  /health           - Health check`);
  console.log(`  • POST /cv-question      - CV question answering`);
  console.log(`  • POST /extract          - Job extraction (URL or JSON)`);
  console.log(`  • POST /generate-score   - Generate job scoring report`);
  console.log(`  • GET  /report/:jobId    - View scoring report HTML`);
  console.log(`  • POST /generate-blurb   - Generate cover letter blurb`);
  console.log(`  • GET  /check-resume/:jobId - Check if resume exists`);
  console.log(`  • POST /generate-resume  - Generate tailored resume`);
  console.log(`  • POST /linkedin-reminder - Create reminder for saved LinkedIn posts`);
  console.log(`  • POST /teal-track       - Deprecated (use Chrome extension)`);
  console.log(`  • GET  /llm?jobID=<id>  - Job info lookup (title, URL, company, blurb)`);
  console.log('');
  console.log('💡 Usage:');
  console.log(`  • Chrome Extension: Will connect automatically`);
  console.log(`  • CLI Commands: Use 'npm run dev' commands as usual`);
  console.log(`  • CV Questions: Enable with ANTHROPIC_API_KEY in .env`);
  console.log('');
  console.log('🛑 To stop: Press Ctrl+C');
  console.log('=' .repeat(50));
});

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('Unified Server: Received SIGTERM, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('Unified Server: Received SIGINT, shutting down gracefully');
  process.exit(0);
});

// Async background job processing function
async function triggerAsyncJobProcessing(jobId, priority, projectDir) {
  console.log(`🔄 Starting async background processing for job ${jobId} (priority: ${priority})`);

  try {
    // Check if criteria.json exists before attempting to score
    const criteriaPath = path.join(projectDir, 'criteria.json');
    if (!fs.existsSync(criteriaPath)) {
      console.log(`  -> ⚠️  No criteria.json found, skipping job scoring`);
      console.log(`  -> Create criteria.json in project root to enable automatic scoring`);
      console.log(`✅ Async background processing completed (no scoring) for job ${jobId}`);
      return;
    }

    // Step 1: Score the job
    console.log(`  -> Scoring job ${jobId}...`);
    const scoreOutput = await new Promise((resolve, reject) => {
      const scoreArgs = ['ts-node', 'components/core/src/cli.ts', 'score', jobId];

      const scoreChild = spawn('npx', scoreArgs, {
        cwd: projectDir,
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';

      scoreChild.stdout.on('data', (data) => {
        const output = data.toString();
        stdout += output;
        // Log scoring progress in real-time
        output.split('\n').filter(line => line.trim()).forEach(line => {
          console.log(`     [SCORE] ${line}`);
        });
      });

      scoreChild.stderr.on('data', (data) => {
        const output = data.toString();
        stderr += output;
        output.split('\n').filter(line => line.trim()).forEach(line => {
          console.log(`     [SCORE:err] ${line}`);
        });
      });

      scoreChild.on('close', (code) => {
        console.log(`  -> Job scoring finished with exit code ${code}`);
        if (code === 0) {
          resolve(stdout);
        } else {
          console.log(`  -> Scoring failed. Full stderr: ${stderr}`);
          reject(new Error(`Job scoring failed with code ${code}: ${stderr}`));
        }
      });

      // Set timeout for scoring
      setTimeout(() => {
        scoreChild.kill();
        reject(new Error('Job scoring timed out after 60 seconds'));
      }, 60000);
    });
    
    console.log(`  -> Job scoring completed for ${jobId}`);
    
    // Step 2: Check if resume generation should be triggered
    // Parse the score from the output
    const scoreMatch = scoreOutput.match(/Overall Score:\s*(\d+)%/);
    const jobScore = scoreMatch ? parseInt(scoreMatch[1]) : null;
    
    if (!jobScore) {
      console.log(`  -> Could not parse job score, skipping resume generation`);
      console.log(`✅ Async background processing completed (scoring only) for job ${jobId}`);
      return;
    }
    
    console.log(`  -> Job score: ${jobScore}%`);
    
    // Load workflow config to check if resume generation is enabled
    let shouldGenerateResume = false;
    let scoreThreshold = 70; // default
    
    try {
      const yaml = require('js-yaml');
      const configPath = path.join(projectDir, 'auto-workflow-config.yaml');
      
      if (fs.existsSync(configPath)) {
        const workflowConfig = yaml.load(fs.readFileSync(configPath, 'utf8'));
        
        if (workflowConfig && workflowConfig.workflow_config) {
          const config = workflowConfig.workflow_config;
          scoreThreshold = config.score_threshold || 70;
          
          // Check if resume generation is enabled and score meets threshold
          if (config.steps && config.steps.resume === true) {
            shouldGenerateResume = jobScore >= scoreThreshold;
          } else {
            console.log(`  -> Resume generation disabled in workflow config`);
          }
        }
      } else {
        console.log(`  -> No workflow config found at ${configPath}, skipping resume generation`);
      }
    } catch (configError) {
      console.log(`  -> Error loading workflow config: ${configError.message}`);
    }
    
    if (!shouldGenerateResume) {
      if (jobScore < scoreThreshold) {
        console.log(`  -> Job score ${jobScore}% is below threshold ${scoreThreshold}%, skipping resume generation`);
      }
      console.log(`✅ Async background processing completed (scoring only) for job ${jobId}`);
      return;
    }
    
    // Step 3: Generate resume (only if enabled and score meets threshold)
    console.log(`  -> Generating resume for job ${jobId} (score ${jobScore}% >= ${scoreThreshold}%)...`);
    const resumeOutput = await new Promise((resolve, reject) => {
      const resumeArgs = ['ts-node', 'components/core/src/cli.ts', 'resume', jobId];
      
      const resumeChild = spawn('npx', resumeArgs, {
        cwd: projectDir,
        stdio: ['pipe', 'pipe', 'pipe']
      });
      
      let stdout = '';
      let stderr = '';

      resumeChild.stdout.on('data', (data) => {
        const output = data.toString();
        stdout += output;
        // Log resume generation progress in real-time
        output.split('\n').filter(line => line.trim()).forEach(line => {
          console.log(`     [RESUME] ${line}`);
        });
      });

      resumeChild.stderr.on('data', (data) => {
        const output = data.toString();
        stderr += output;
        output.split('\n').filter(line => line.trim()).forEach(line => {
          console.log(`     [RESUME:err] ${line}`);
        });
      });

      resumeChild.on('close', (code) => {
        console.log(`  -> Resume generation finished with exit code ${code}`);
        if (code === 0) {
          resolve(stdout);
        } else {
          console.log(`  -> Resume generation failed. Full stderr: ${stderr}`);
          reject(new Error(`Resume generation failed with code ${code}: ${stderr}`));
        }
      });
      
      // Set timeout for resume generation
      setTimeout(() => {
        resumeChild.kill();
        reject(new Error('Resume generation timed out after 120 seconds'));
      }, 120000);
    });
    
    console.log(`✅ Async background processing completed successfully for job ${jobId}`);
    console.log(`  -> Scoring: ✅ Complete`);
    console.log(`  -> Resume: ✅ Complete`);
    
  } catch (error) {
    console.log(`❌ Async background processing failed for job ${jobId}: ${error.message}`);
    // Don't throw - we don't want background failures to affect the main flow
  }
}
