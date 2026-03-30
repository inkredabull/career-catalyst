/**
 * Entry Points - Global functions exposed to Google Apps Script
 *
 * @module entry-points
 */

import { CONFIG } from '../config';
import { Logger } from '../utils/Logger';
import { MenuService } from '../ui/MenuService';
import { DialogService } from '../ui/DialogService';
import { SheetService } from '../data/SheetService';
import { ConfigService } from '../data/ConfigService';
import { AIService } from '../ai/AIService';
import { DocumentService } from '../document/DocumentService';
import { AchievementService } from '../business/AchievementService';
import { EvaluationService } from '../business/EvaluationService';
import { CustomizationService } from '../business/CustomizationService';
import { ResumeFormatter } from '../business/ResumeFormatter';
import { WorkHistoryExporter } from '../business/WorkHistoryExporter';

/**
 * Services container
 */
interface Services {
  sheet: SheetService;
  config: ConfigService;
  ai: AIService;
  document: DocumentService;
  achievement: AchievementService;
  evaluation: EvaluationService;
  customization: CustomizationService;
  resumeFormatter: ResumeFormatter;
  workHistoryExporter: WorkHistoryExporter;
}

/**
 * Global services object - initialized on first use
 */
let SERVICES: Services | null = null;

/**
 * Initialize all services
 * @returns Services object
 */
function initializeServices(): Services {
  if (SERVICES) return SERVICES;

  const sheetService = new SheetService();
  const configService = new ConfigService(sheetService);
  const aiService = new AIService(configService);
  const documentService = new DocumentService();
  const achievementService = new AchievementService(aiService);
  const evaluationService = new EvaluationService(aiService);
  const customizationService = new CustomizationService(aiService, sheetService);
  const resumeFormatter = new ResumeFormatter(documentService, sheetService);
  const workHistoryExporter = new WorkHistoryExporter(
    documentService,
    sheetService,
    evaluationService
  );

  SERVICES = {
    sheet: sheetService,
    config: configService,
    ai: aiService,
    document: documentService,
    achievement: achievementService,
    evaluation: evaluationService,
    customization: customizationService,
    resumeFormatter: resumeFormatter,
    workHistoryExporter: workHistoryExporter,
  };

  return SERVICES;
}

/**
 * Triggered when spreadsheet is opened
 * @param _e - Event object (unused)
 */
export function onOpen(_e?: GoogleAppsScript.Events.SheetsOnOpen): void {
  try {
    const ui = SpreadsheetApp.getUi();
    MenuService.createCustomMenu(ui);
  } catch (error) {
    Logger.error('Error in onOpen', error as Error);
  }
}

/**
 * Generate achievement from current row
 * Menu item: "Generate summary"
 */
export function fetch(): void {
  try {
    const services = initializeServices();
    const { row, headers } = services.sheet.getActiveRowData(CONFIG.SHEETS.STORY_BANK);

    // Get the active cell to determine target audience from column header
    const currentCell = services.sheet.getActiveCell();
    const columnIndex = currentCell.getColumn();
    const columnHeader = headers[columnIndex - 1]; // Convert 1-indexed to 0-indexed

    // Determine target audience based on column header
    let targetAudience = 'cv'; // default
    if (columnHeader) {
      const headerLower = columnHeader.toLowerCase();
      if (headerLower.includes('linkedin')) {
        targetAudience = 'linkedin';
      } else if (headerLower.includes('cv')) {
        targetAudience = 'cv';
      }
    }

    Logger.log(`Column header: "${columnHeader}" -> Target audience: ${targetAudience}`);

    const challenge = row[headers.indexOf(CONFIG.COLUMNS.STORY_BANK.CHALLENGE)] as string;
    const actions = row[headers.indexOf(CONFIG.COLUMNS.STORY_BANK.ACTIONS)] as string;
    const result = row[headers.indexOf(CONFIG.COLUMNS.STORY_BANK.RESULT)] as string;
    const client = row[headers.indexOf(CONFIG.COLUMNS.STORY_BANK.CLIENT)] as boolean;

    const summary = services.achievement.generateAchievement(
      challenge,
      actions,
      result,
      client,
      targetAudience
    );

    currentCell.setValue(summary);
  } catch (error) {
    Logger.error('Error in fetch', error as Error);
    DialogService.showAlert(`Error generating achievement: ${(error as Error).message}`);
  }
}

/**
 * Shorten achievement in current cell
 * Menu item: "Shorten"
 */
export function shorten(): void {
  try {
    const services = initializeServices();
    const { row, headers } = services.sheet.getActiveRowData(CONFIG.SHEETS.STORY_BANK);

    const achievement = row[headers.indexOf(CONFIG.COLUMNS.STORY_BANK.ACHIEVEMENT)] as string;
    const shortened = services.achievement.shortenAchievement(achievement);

    const currentCell = services.sheet.getActiveCell();
    currentCell.setValue(shortened);
  } catch (error) {
    Logger.error('Error in shorten', error as Error);
    DialogService.showAlert(`Error shortening achievement: ${(error as Error).message}`);
  }
}

/**
 * Evaluate achievement in current row
 * Menu item: "Evaluate achievement"
 * Note: Renamed from 'eval' to 'evaluate' (eval is reserved word)
 */
export function evaluate(): void {
  try {
    const services = initializeServices();
    const sheet = services.sheet.getSheet('Work History');
    const data = sheet.getDataRange().getValues();
    const headers = data[0] as string[];

    const currentCell = sheet.getActiveCell();
    const rowIndex = currentCell.getRow();
    const row = sheet.getRange(`${rowIndex}:${rowIndex}`).getValues()[0] || [];

    const achievement = row[headers.indexOf('Resume Bullet Point')] as string;

    const prompt = `Does the following describe something accomplished by more of a "Doer" or "Achiever"?

${achievement}

Return either "Doer" or "Achiever" as output.`;

    const summary = services.ai.query(prompt, { maxTokens: CONFIG.AI.MAX_TOKENS.CATEGORIZATION });
    currentCell.setValue(summary);
  } catch (error) {
    Logger.error('Error in evaluate', error as Error);
    DialogService.showAlert(`Error evaluating achievement: ${(error as Error).message}`);
  }
}

/**
 * Find theme/category for achievement
 * Menu item: "Categorize"
 */
export function findTheme(): void {
  try {
    const services = initializeServices();
    const sheet = services.sheet.getSheet(CONFIG.SHEETS.STORY_BANK);
    const data = sheet.getDataRange().getValues();
    const headers = data[0] as string[];

    const currentCell = sheet.getActiveCell();
    const rowIndex = currentCell.getRow();
    const row = sheet.getRange(`${rowIndex}:${rowIndex}`).getValues()[0] || [];

    const achievement = row[headers.indexOf(CONFIG.COLUMNS.STORY_BANK.ACHIEVEMENT)] as string;

    // Get functions from sheet
    const functionsSheet = services.sheet.getSheet(CONFIG.SHEETS.FUNCTION);
    const functionsData = functionsSheet
      .getRange('F2:F')
      .getValues()
      .flat()
      .filter((r) => r !== '') as string[];

    const category = services.achievement.categorizeAchievement(achievement, functionsData);
    currentCell.setValue(category);
  } catch (error) {
    Logger.error('Error in findTheme', error as Error);
    DialogService.showAlert(`Error finding theme: ${(error as Error).message}`);
  }
}

/**
 * Get judgement score for achievement
 * Menu item: "Get judgement"
 */
export function getJudgement(): void {
  try {
    const services = initializeServices();
    const sheet = services.sheet.getSheet('Work History');
    const data = sheet.getDataRange().getValues();
    const headers = data[0] as string[];

    const currentCell = sheet.getActiveCell();
    const rowIndex = currentCell.getRow();
    const row = sheet.getRange(`${rowIndex}:${rowIndex}`).getValues()[0] || [];

    const achievement = row[headers.indexOf('Resume Bullet Point')] as string;
    const score = services.evaluation.getJudgement(achievement);

    currentCell.setValue(score);
  } catch (error) {
    Logger.error('Error in getJudgement', error as Error);
    DialogService.showAlert(`Error getting judgement: ${(error as Error).message}`);
  }
}

/**
 * Get KPI for achievement
 * Menu item: "Get KPI"
 */
export function getKeyPerformanceIndicator(): void {
  try {
    const services = initializeServices();
    const sheet = services.sheet.getSheet('Work History');
    const data = sheet.getDataRange().getValues();
    const headers = data[0] as string[];

    const currentCell = sheet.getActiveCell();
    const rowIndex = currentCell.getRow();
    const row = sheet.getRange(`${rowIndex}:${rowIndex}`).getValues()[0] || [];

    const achievement = row[headers.indexOf('Resume Bullet Point')] as string;

    // Get KPIs
    const kpiSheet = services.sheet.getSheet('Metrics : KPIs (business & function)');
    const lastRow = kpiSheet.getLastRow();
    const kpis = kpiSheet.getRange(2, 1, lastRow, 1).getValues().flat().filter(String).join('\n');

    const prompt = `Given the following achievement, under what single standard key performance indicator (KPI) from the following KPIs would it most likely belong?

ACHIEVEMENT: ${achievement}

KPIs: ${kpis}

Return only the KPI.`;

    const kpi = services.ai.query(prompt, { maxTokens: CONFIG.AI.MAX_TOKENS.CATEGORIZATION });
    currentCell.setValue(kpi);
  } catch (error) {
    Logger.error('Error in getKeyPerformanceIndicator', error as Error);
    DialogService.showAlert(`Error getting KPI: ${(error as Error).message}`);
  }
}

/**
 * Export work history as Google Doc
 * Menu item: "Get Work History as G Doc"
 */
export function getWorkHistoryAsGDoc(): void {
  try {
    const services = initializeServices();
    const url = services.workHistoryExporter.exportWorkHistory();
    DialogService.showLink(url, 'Work History Exported');
  } catch (error) {
    Logger.error('Error in getWorkHistoryAsGDoc', error as Error);
    DialogService.showAlert(`Error exporting work history: ${(error as Error).message}`);
  }
}

/**
 * Show modal for resume generation
 * Menu item: "Generate resume"
 */
export function showModal(): void {
  try {
    DialogService.showModal('dialog', 'Sample Modal');
  } catch (error) {
    Logger.error('Error in showModal', error as Error);
    DialogService.showAlert(`Error showing modal: ${(error as Error).message}`);
  }
}

/**
 * Sort the active sheet
 * Menu item: "Sort"
 */
export function sortSheet(): void {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    const headerRowRange = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues();
    const headers = headerRowRange[0] as string[];

    const seqColIndex = headers.indexOf('Seq') + 1;
    const clientColIndex = headers.indexOf('Client') + 1;
    const wowColIndex = headers.indexOf('Wow') + 1;

    const dataRange = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn());

    dataRange.sort([
      { column: seqColIndex, ascending: true },
      { column: clientColIndex, ascending: true },
      { column: wowColIndex, ascending: false },
    ]);
  } catch (error) {
    Logger.error('Error in sortSheet', error as Error);
    DialogService.showAlert(`Error sorting sheet: ${(error as Error).message}`);
  }
}

/**
 * Create unique ID for achievement
 * Menu item: "Create ID"
 */
export function createID(): void {
  try {
    const services = initializeServices();
    const { row, headers } = services.sheet.getActiveRowData(CONFIG.SHEETS.STORY_BANK);

    const achievement = row[headers.indexOf(CONFIG.COLUMNS.STORY_BANK.ACHIEVEMENT)] as string;
    const uniqueID = services.achievement.generateUniqueId(achievement);

    const currentCell = services.sheet.getActiveCell();
    currentCell.setValue(uniqueID);
  } catch (error) {
    Logger.error('Error in createID', error as Error);
    DialogService.showAlert(`Error creating ID: ${(error as Error).message}`);
  }
}

/**
 * Create customization for job
 * Menu item: "Customize"
 */
export function createCustomization(): void {
  try {
    const services = initializeServices();
    const customized = services.customization.customizeResume();

    const sheet = services.sheet.getSheet(CONFIG.SHEETS.CUSTOMIZER);
    const currentCell = sheet.getActiveCell();
    currentCell.setValue(customized);
  } catch (error) {
    Logger.error('Error in createCustomization', error as Error);
    DialogService.showAlert(`Error creating customization: ${(error as Error).message}`);
  }
}

/**
 * Generate achievement using specific model
 * @param modelName - Name of model ('claude', 'gemini', 'openai', 'mistral', 'cohere')
 */
export function fetchWithModel(modelName: string): void {
  try {
    const services = initializeServices();
    const { row, headers } = services.sheet.getActiveRowData(CONFIG.SHEETS.STORY_BANK);

    // Get the active cell to determine target audience from column header
    const currentCell = services.sheet.getActiveCell();
    const columnIndex = currentCell.getColumn();
    const columnHeader = headers[columnIndex - 1]; // Convert 1-indexed to 0-indexed

    // Determine target audience based on column header
    let targetAudience = 'cv'; // default
    if (columnHeader) {
      const headerLower = columnHeader.toLowerCase();
      if (headerLower.includes('linkedin')) {
        targetAudience = 'linkedin';
      } else if (headerLower.includes('cv')) {
        targetAudience = 'cv';
      }
    }

    // Select appropriate max_tokens based on target audience
    const maxTokens =
      targetAudience === 'linkedin'
        ? CONFIG.AI.MAX_TOKENS.ACHIEVEMENT_LINKEDIN
        : CONFIG.AI.MAX_TOKENS.ACHIEVEMENT_CV;

    Logger.log(
      `fetchWithModel: column="${columnHeader}" -> audience=${targetAudience}, maxTokens=${maxTokens}`
    );

    const challenge = row[headers.indexOf(CONFIG.COLUMNS.STORY_BANK.CHALLENGE)] as string;
    const actions = row[headers.indexOf(CONFIG.COLUMNS.STORY_BANK.ACTIONS)] as string;
    const result = row[headers.indexOf(CONFIG.COLUMNS.STORY_BANK.RESULT)] as string;
    const client = row[headers.indexOf(CONFIG.COLUMNS.STORY_BANK.CLIENT)] as boolean;

    const prompt = services.achievement.buildPrompt(
      challenge,
      actions,
      result,
      client,
      targetAudience
    );
    const response = services.ai.query(prompt, {
      provider: modelName,
      maxTokens: maxTokens,
    });

    currentCell.setValue(response);

    Logger.log(`Generated achievement using ${modelName}: ${response.length} chars`);
  } catch (error) {
    Logger.error(`Error in fetchWithModel with ${modelName}`, error as Error);
    throw new Error(`Failed to generate with ${modelName}: ${(error as Error).message}`);
  }
}

/**
 * Result object from model generation
 */
interface ModelGenerationResult {
  text: string;
  latencyMs: number;
  prompt: string;
  config: {
    provider: string;
    model: string;
    maxTokens: number;
    targetAudience: string;
    columnHeader: string;
  };
}

/**
 * Generate achievement without writing to cell (for comparison)
 * @param modelName - Name of model ('claude', 'gemini', 'openai', 'mistral', 'cohere')
 * @returns Result object with text, latency, prompt, and config
 */
export function generateAchievementWithModel(modelName: string): ModelGenerationResult {
  try {
    const startTime = new Date().getTime();

    const services = initializeServices();
    const { row, headers } = services.sheet.getActiveRowData(CONFIG.SHEETS.STORY_BANK);

    // Get the active cell to determine target audience from column header
    const currentCell = services.sheet.getActiveCell();
    const columnIndex = currentCell.getColumn();
    const columnHeader = headers[columnIndex - 1]; // Convert 1-indexed to 0-indexed

    // Determine target audience based on column header
    let targetAudience = 'cv'; // default
    if (columnHeader) {
      const headerLower = columnHeader.toLowerCase();
      if (headerLower.includes('linkedin')) {
        targetAudience = 'linkedin';
      } else if (headerLower.includes('cv')) {
        targetAudience = 'cv';
      }
    }

    Logger.log(
      `Column header: "${columnHeader}" -> Target audience: ${targetAudience} for model: ${modelName}`
    );

    const challenge = row[headers.indexOf(CONFIG.COLUMNS.STORY_BANK.CHALLENGE)] as string;
    const actions = row[headers.indexOf(CONFIG.COLUMNS.STORY_BANK.ACTIONS)] as string;
    const result = row[headers.indexOf(CONFIG.COLUMNS.STORY_BANK.RESULT)] as string;
    const client = row[headers.indexOf(CONFIG.COLUMNS.STORY_BANK.CLIENT)] as boolean;

    const prompt = services.achievement.buildPrompt(
      challenge,
      actions,
      result,
      client,
      targetAudience
    );

    // Select appropriate max_tokens based on target audience
    let maxTokens =
      targetAudience === 'linkedin'
        ? CONFIG.AI.MAX_TOKENS.ACHIEVEMENT_LINKEDIN
        : CONFIG.AI.MAX_TOKENS.ACHIEVEMENT_CV;

    // Reasoning models (DeepSeek) need more tokens for internal thinking process
    const modelId = services.ai['modelMap'][modelName];
    const isReasoningModel = modelId && modelId.includes('deepseek');

    if (isReasoningModel) {
      const originalTokens = maxTokens;
      maxTokens = maxTokens * CONFIG.AI.REASONING_MULTIPLIER;
      Logger.log(
        `Reasoning model detected (${modelId}): increased maxTokens from ${originalTokens} to ${maxTokens}`
      );
    }

    Logger.log(
      `generateAchievementWithModel: using maxTokens=${maxTokens} for audience=${targetAudience}`
    );

    // Configuration used for this request
    const config = {
      provider: modelName,
      model: services.ai['modelMap'][modelName] || '',
      maxTokens: maxTokens,
      targetAudience: targetAudience,
      columnHeader: columnHeader || '',
    };

    const response = services.ai.query(prompt, {
      provider: modelName,
      maxTokens: maxTokens,
    });

    const endTime = new Date().getTime();
    const latencyMs = endTime - startTime;

    Logger.log(
      `Generated achievement using ${modelName}: ${response.length} chars in ${latencyMs}ms`
    );

    // Log if response is empty
    if (!response || response.length === 0) {
      Logger.warn(`Empty response from ${modelName}!`);
    }

    return {
      text: response || '',
      latencyMs: latencyMs,
      prompt: prompt,
      config: config,
    };
  } catch (error) {
    Logger.error(`Error in generateAchievementWithModel with ${modelName}`, error as Error);
    throw new Error(`Failed to generate with ${modelName}: ${(error as Error).message}`);
  }
}

/**
 * Set active cell value to selected model output
 * @param content - Achievement text to set
 */
export function setActiveCellValue(content: string): void {
  try {
    const services = initializeServices();
    const currentCell = services.sheet.getActiveCell();
    currentCell.setValue(content);
    Logger.log(`Set active cell to: ${content.substring(0, 50)}...`);
  } catch (error) {
    Logger.error('Error in setActiveCellValue', error as Error);
    throw new Error(`Failed to set cell value: ${(error as Error).message}`);
  }
}

/**
 * Choose model for single generation
 * Menu item: "Choose Model"
 */
export function chooseModel(): void {
  // This function requires HTML template - skipping for now
  // Would need to migrate HTML templates as well
  DialogService.showAlert('Choose Model feature requires HTML template migration');
}

/**
 * Compare models side-by-side
 * Menu item: "Compare Models"
 */
export function compareModels(): void {
  try {
    const services = initializeServices();
    const models = services.ai['modelMap'] as Record<string, string>;

    const claudeModel = models['claude'] || CONFIG.AI.FALLBACK_MODELS.CLAUDE;
    const geminiModel = models['gemini'] || CONFIG.AI.FALLBACK_MODELS.GEMINI;
    const openaiModel = models['openai'] || CONFIG.AI.FALLBACK_MODELS.OPENAI;
    const mistralModel = models['mistral'] || CONFIG.AI.FALLBACK_MODELS.MISTRAL;
    const cohereModel = models['cohere'] || CONFIG.AI.FALLBACK_MODELS.COHERE;

    const fmt = (id: string): string => {
      const parts = id.split('/');
      const model = parts[1] || id;
      return model.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()).substring(0, 50);
    };

    const claudeDisplay = fmt(claudeModel);
    const geminiDisplay = fmt(geminiModel);
    const openaiDisplay = fmt(openaiModel);
    const mistralDisplay = fmt(mistralModel);
    const cohereDisplay = fmt(cohereModel);

    const html = `<!DOCTYPE html>
<html>
<head>
  <base target="_top">
  <style>
    body{font-family:Arial,sans-serif;padding:20px;margin:0;background:#f5f5f5}
    .container{max-width:1200px;margin:0 auto}
    .controls{background:white;padding:20px;border-radius:8px;margin-bottom:20px;box-shadow:0 1px 3px rgba(0,0,0,.1);text-align:center}
    .results{display:grid;grid-template-columns:repeat(5,1fr);gap:15px}
    .result-card{background:white;border-radius:8px;padding:20px;box-shadow:0 1px 3px rgba(0,0,0,.1);min-height:250px;display:flex;flex-direction:column}
    .result-card h4{margin:0 0 10px;color:#1a73e8;border-bottom:2px solid #1a73e8;padding-bottom:8px;font-size:15px}
    .model-label{font-size:12px;color:#666;margin-bottom:15px}
    .result-content{flex:1;line-height:1.6;color:#333;font-size:14px;overflow-wrap:break-word}
    .loading{text-align:center;color:#999;font-style:italic;padding:40px 0}
    .char-count{font-size:12px;color:#666;margin-top:15px;padding-top:10px;border-top:1px solid #eee;font-weight:600}
    .metadata{font-size:11px;color:#666;margin-top:10px;padding:8px;background:#f8f9fa;border-radius:4px;font-family:monospace;display:none}
    .metadata-row{margin:4px 0;display:flex;justify-content:space-between;align-items:center}
    .metadata-label{font-weight:600;color:#555}
    .metadata-value{color:#333}
    .latency{color:#28a745;font-weight:600}
    .latency.slow{color:#ffc107}
    .latency.very-slow{color:#dc3545}
    .prompt-link{color:#1a73e8;text-decoration:none;cursor:pointer;font-size:11px}
    .prompt-link:hover{text-decoration:underline}
    .choose-btn{width:100%;padding:8px;margin-top:10px;background:#1a73e8;color:white;border:none;border-radius:4px;font-size:13px;font-weight:600;cursor:pointer;display:none}
    .choose-btn:hover{background:#1557b0}
    .choose-btn:disabled{background:#ccc;cursor:not-allowed}
    .choose-btn.success{background:#28a745}
    .winner{background:#d4edda;border:2px solid #28a745}
    .winner h4{color:#28a745;border-bottom-color:#28a745}
    .winner-badge{display:inline-block;background:#28a745;color:white;padding:2px 8px;border-radius:12px;font-size:10px;margin-left:8px;font-weight:normal}
    .status{margin-top:15px;padding:10px;border-radius:4px;display:none;text-align:center}
    .status.error{background:#f8d7da;color:#721c24;display:block}
  </style>
</head>
<body>
  <div class="container">
    <div class="controls">
      <div id="status" class="status">Generating all models...</div>
    </div>
    <div class="results" id="results">
      <div class="result-card" id="resultClaude">
        <h4>🤖 ${claudeDisplay}</h4>
        <div class="model-label">${claudeModel}</div>
        <div class="result-content" id="contentClaude"><div class="loading">Generating...</div></div>
        <div class="char-count" id="countClaude"></div>
        <div class="metadata" id="metadataClaude"></div>
        <button class="choose-btn" id="chooseClaude" onclick="chooseModel('claude')">✓ Choose This</button>
      </div>
      <div class="result-card" id="resultGemini">
        <h4>🔮 ${geminiDisplay}</h4>
        <div class="model-label">${geminiModel}</div>
        <div class="result-content" id="contentGemini"><div class="loading">Generating...</div></div>
        <div class="char-count" id="countGemini"></div>
        <div class="metadata" id="metadataGemini"></div>
        <button class="choose-btn" id="chooseGemini" onclick="chooseModel('gemini')">✓ Choose This</button>
      </div>
      <div class="result-card" id="resultOpenAI">
        <h4>💬 ${openaiDisplay}</h4>
        <div class="model-label">${openaiModel}</div>
        <div class="result-content" id="contentOpenAI"><div class="loading">Generating...</div></div>
        <div class="char-count" id="countOpenAI"></div>
        <div class="metadata" id="metadataOpenAI"></div>
        <button class="choose-btn" id="chooseOpenAI" onclick="chooseModel('openai')">✓ Choose This</button>
      </div>
      <div class="result-card" id="resultMistral">
        <h4>⚡ ${mistralDisplay}</h4>
        <div class="model-label">${mistralModel}</div>
        <div class="result-content" id="contentMistral"><div class="loading">Generating...</div></div>
        <div class="char-count" id="countMistral"></div>
        <div class="metadata" id="metadataMistral"></div>
        <button class="choose-btn" id="chooseMistral" onclick="chooseModel('mistral')">✓ Choose This</button>
      </div>
      <div class="result-card" id="resultCohere">
        <h4>🔷 ${cohereDisplay}</h4>
        <div class="model-label">${cohereModel}</div>
        <div class="result-content" id="contentCohere"><div class="loading">Generating...</div></div>
        <div class="char-count" id="countCohere"></div>
        <div class="metadata" id="metadataCohere"></div>
        <button class="choose-btn" id="chooseCohere" onclick="chooseModel('cohere')">✓ Choose This</button>
      </div>
    </div>
  </div>
  <script>
    const MODELS=[
      {key:'claude',contentId:'contentClaude',countId:'countClaude',cardId:'resultClaude',buttonId:'chooseClaude',metadataId:'metadataClaude'},
      {key:'gemini',contentId:'contentGemini',countId:'countGemini',cardId:'resultGemini',buttonId:'chooseGemini',metadataId:'metadataGemini'},
      {key:'openai',contentId:'contentOpenAI',countId:'countOpenAI',cardId:'resultOpenAI',buttonId:'chooseOpenAI',metadataId:'metadataOpenAI'},
      {key:'mistral',contentId:'contentMistral',countId:'countMistral',cardId:'resultMistral',buttonId:'chooseMistral',metadataId:'metadataMistral'},
      {key:'cohere',contentId:'contentCohere',countId:'countCohere',cardId:'resultCohere',buttonId:'chooseCohere',metadataId:'metadataCohere'}
    ];
    var modelResults={};
    function runComparison(){
      var status=document.getElementById('status');
      status.textContent='Generating all models...';
      status.style.display='block';
      MODELS.forEach(function(m){
        document.getElementById(m.contentId).innerHTML='<div class="loading">Generating...</div>';
        document.getElementById(m.countId).textContent='';
        document.getElementById(m.metadataId).style.display='none';
        document.getElementById(m.cardId).classList.remove('winner');
        document.getElementById(m.buttonId).style.display='none';
        var h=document.getElementById(m.cardId).querySelector('h4');
        var b=h.querySelector('.winner-badge');if(b)b.remove();
      });
      modelResults={};
      var completed=0;
      MODELS.forEach(function(m){
        google.script.run
          .withSuccessHandler(function(result){
            modelResults[m.key]=result;
            displayResult(m.contentId,m.countId,result,m.key);
            completed++;
            if(completed===MODELS.length){finishComparison(modelResults);status.textContent='All models completed!';status.className='status';}
            else{status.textContent='Generating... ('+completed+'/'+MODELS.length+')';}
          })
          .withFailureHandler(function(error){
            document.getElementById(m.contentId).innerHTML='<div style="color:red">Error: '+error.message+'</div>';
            completed++;
            if(completed===MODELS.length){status.textContent='Completed with errors';status.className='status error';}
            else{status.textContent='Generating... ('+completed+'/'+MODELS.length+')';}
          })
          .generateAchievementWithModel(m.key);
      });
    }
    function chooseModel(key){
      var m=MODELS.find(function(x){return x.key===key;});
      if(!m){alert('Model not found');return;}
      var r=modelResults[key];
      if(!r||!r.text){alert('No result available');return;}
      var btn=document.getElementById(m.buttonId);
      btn.disabled=true;btn.textContent='Applying...';
      google.script.run
        .withSuccessHandler(function(){btn.textContent='✓ Applied!';btn.classList.add('success');setTimeout(function(){google.script.host.close();},1000);})
        .withFailureHandler(function(e){btn.disabled=false;btn.textContent='✓ Choose This';alert('Error: '+e.message);})
        .setActiveCellValue(r.text);
    }
    function displayResult(contentId,countId,r,key){
      var text=r.text||'';
      document.getElementById(contentId)[text.length===0?'innerHTML':'textContent']=text.length===0?'<div style="color:#e67e22;font-style:italic">⚠️ Empty response</div>':text;
      document.getElementById(countId).textContent='Characters: '+text.length;
      var m=MODELS.find(function(x){return x.key===key;});
      if(!m)return;
      var el=document.getElementById(m.metadataId);
      var cls='latency'+(r.latencyMs>5000?' very-slow':r.latencyMs>2000?' slow':'');
      el.innerHTML='<div class="metadata-row"><span class="metadata-label">⚡ Latency:</span><span class="'+cls+'">'+(r.latencyMs/1000).toFixed(2)+'s</span></div>'
        +'<div class="metadata-row"><span class="metadata-label">Model ID:</span><span class="metadata-value">'+r.config.model+'</span></div>'
        +'<div class="metadata-row"><span class="metadata-label">Max Tokens:</span><span class="metadata-value">'+r.config.maxTokens+'</span></div>'
        +'<div class="metadata-row"><span class="metadata-label">Audience:</span><span class="metadata-value">'+r.config.targetAudience+'</span></div>'
        +'<div class="metadata-row"><span class="metadata-label">Prompt:</span><a class="prompt-link" onclick="showPrompt(\''+key+'\')">View Full Prompt</a></div>';
      el.style.display='block';
      document.getElementById(m.buttonId).style.display='block';
    }
    function showPrompt(key){
      var r=modelResults[key];
      if(!r||!r.prompt){alert('Prompt not available');return;}
      var w=window.open('','Prompt','width=800,height=600,scrollbars=yes');
      w.document.write('<html><head><title>Prompt for '+key+'</title><style>body{font-family:monospace;padding:20px;white-space:pre-wrap;word-wrap:break-word}h3{font-family:Arial}</style></head><body><h3>Full Prompt — '+key.toUpperCase()+'</h3><hr>'+r.prompt+'</body></html>');
      w.document.close();
    }
    function finishComparison(results){
      var shortest=null,shortestLen=Infinity,shortestKey=null;
      Object.keys(results).forEach(function(k){
        var t=results[k].text||results[k];
        if(t.length>=40&&t.length<shortestLen){shortest=t;shortestLen=t.length;shortestKey=k;}
      });
      if(shortestKey){
        var wm=MODELS.find(function(m){return m.key===shortestKey;});
        if(wm){
          document.getElementById(wm.cardId).classList.add('winner');
          document.getElementById(wm.cardId).querySelector('h4').innerHTML+='<span class="winner-badge">Most Concise</span>';
        }
      }
    }
    window.addEventListener('DOMContentLoaded',function(){runComparison();});
  </script>
</body>
</html>`;

    const htmlOutput = HtmlService.createHtmlOutput(html).setWidth(1250).setHeight(650);
    SpreadsheetApp.getUi().showModalDialog(htmlOutput, 'Compare All AI Models');
  } catch (error) {
    Logger.error('Error in compareModels', error as Error);
    DialogService.showAlert(`Error showing comparison: ${(error as Error).message}`);
  }
}

/**
 * View currently active AI models
 * Menu item: "View Current Models"
 */
export function viewCurrentModels(): void {
  try {
    const services = initializeServices();
    const models = services.ai['modelMap'];

    const claudeModel = models['claude'] || CONFIG.AI.FALLBACK_MODELS.CLAUDE;
    const geminiModel = models['gemini'] || CONFIG.AI.FALLBACK_MODELS.GEMINI;
    const openaiModel = models['openai'] || CONFIG.AI.FALLBACK_MODELS.OPENAI;
    const mistralModel = models['mistral'] || CONFIG.AI.FALLBACK_MODELS.MISTRAL;
    const cohereModel = models['cohere'] || CONFIG.AI.FALLBACK_MODELS.COHERE;

    const ui = SpreadsheetApp.getUi();
    const message =
      `Current AI Models:\n\n` +
      `Claude: ${claudeModel}\n` +
      `Gemini: ${geminiModel}\n` +
      `OpenAI: ${openaiModel}\n` +
      `Mistral: ${mistralModel}\n` +
      `Cohere: ${cohereModel}\n\n` +
      `These models are refreshed daily from OpenRouter.\n` +
      `Use "Refresh Models" to force an update.`;

    ui.alert('Current AI Models', message, ui.ButtonSet.OK);
  } catch (error) {
    Logger.error('Error in viewCurrentModels', error as Error);
    DialogService.showAlert(`Error viewing models: ${(error as Error).message}`);
  }
}

/**
 * Force refresh AI models from OpenRouter
 * Menu item: "Refresh Models"
 */
export function refreshModelsMenu(): void {
  try {
    const ui = SpreadsheetApp.getUi();

    // Confirm refresh
    const response = ui.alert(
      'Refresh AI Models',
      'This will fetch the latest models from OpenRouter.\n\n' + 'Do you want to continue?',
      ui.ButtonSet.YES_NO
    );

    if (response !== ui.Button.YES) {
      return;
    }

    const services = initializeServices();
    const newModels = services.ai.refreshModels();

    const message =
      `Models refreshed successfully!\n\n` +
      `Claude: ${newModels['claude']}\n` +
      `Gemini: ${newModels['gemini']}\n` +
      `OpenAI: ${newModels['openai']}\n` +
      `Mistral: ${newModels['mistral']}\n` +
      `Cohere: ${newModels['cohere']}`;

    ui.alert('Models Updated', message, ui.ButtonSet.OK);
  } catch (error) {
    Logger.error('Error in refreshModelsMenu', error as Error);
    SpreadsheetApp.getUi().alert(
      'Refresh Failed',
      `Error refreshing models: ${(error as Error).message}\n\n` + 'Using cached models.',
      SpreadsheetApp.getUi().ButtonSet.OK
    );
  }
}

/**
 * One-time setup function for OpenRouter API key
 * Run this manually to configure API credentials
 */
export function setupAPIKeys(): void {
  try {
    const ui = SpreadsheetApp.getUi();

    // Show info message
    ui.alert(
      'OpenRouter Setup',
      'This script uses OpenRouter for unified AI model access.\n\n' +
        'One API key for all models (Claude, GPT-4, Gemini, etc.)\n' +
        'Simple pay-as-you-go pricing\n' +
        'No vendor lock-in\n\n' +
        'Get your API key at: https://openrouter.ai/keys',
      ui.ButtonSet.OK
    );

    // OpenRouter API Key
    const openrouterResponse = ui.prompt(
      'Setup: OpenRouter API Key',
      'Enter your OpenRouter API key:',
      ui.ButtonSet.OK_CANCEL
    );

    if (openrouterResponse.getSelectedButton() === ui.Button.OK) {
      const openrouterKey = openrouterResponse.getResponseText();
      PropertiesService.getScriptProperties().setProperty('OPENROUTER_API_KEY', openrouterKey);
      Logger.log('OpenRouter API key saved');

      ui.alert(
        'Setup Complete',
        'OpenRouter API key has been saved successfully!\n\nYou can now use all AI features.',
        ui.ButtonSet.OK
      );
    } else {
      ui.alert('Setup Cancelled', 'No API key was saved.', ui.ButtonSet.OK);
    }
  } catch (error) {
    Logger.error('Error in setupAPIKeys', error as Error);
    SpreadsheetApp.getUi().alert(`Error during setup: ${(error as Error).message}`);
  }
}

/**
 * Handle resume generation
 * Called from HTML dialog
 */
export function handleGenerate(): void {
  try {
    const services = initializeServices();
    const url = services.resumeFormatter.generateResume();
    DialogService.showLink(url, 'Resume Generated');
  } catch (error) {
    Logger.error('Error in handleGenerate', error as Error);
    DialogService.showAlert(`Error generating resume: ${(error as Error).message}`);
  }
}

/**
 * Include HTML file content (for templating)
 * @param filename - HTML file name
 * @returns HTML content
 */
export function include(filename: string): string {
  return HtmlService.createTemplateFromFile(filename).evaluate().getContent();
}

/**
 * Rebuild the Table of Contents in the first sheet.
 * Creates clickable HYPERLINK formulas for every subsequent sheet.
 * Menu item: "Update Table of Contents"
 */
export function generateTableOfContents(): void {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheets = ss.getSheets();
    const tocSheet = sheets[0];
    const ssId = ss.getId();

    if (!tocSheet) {
      DialogService.showAlert('No sheets found in this spreadsheet.');
      return;
    }

    tocSheet.clear();
    tocSheet
      .getRange(1, 1, 1, 2)
      .setValues([['Sheet Name', 'Link']])
      .setFontWeight('bold');

    const data: string[][] = [];
    for (let i = 1; i < sheets.length; i++) {
      const sheet = sheets[i];
      if (!sheet) continue;
      const sheetName = sheet.getName();
      const gid = sheet.getSheetId();
      const link = `=HYPERLINK("https://docs.google.com/spreadsheets/d/${ssId}/edit#gid=${gid}","${sheetName}")`;
      data.push([sheetName, link]);
    }

    if (data.length > 0) {
      tocSheet.getRange(2, 1, data.length, 2).setValues(data);
    }

    SpreadsheetApp.getUi().alert('Table of Contents updated!');
  } catch (error) {
    Logger.error('Error in generateTableOfContents', error as Error);
    DialogService.showAlert(`Error generating table of contents: ${(error as Error).message}`);
  }
}

// Make functions globally available for Google Apps Script
declare const global: {
  onOpen: typeof onOpen;
  fetch: typeof fetch;
  shorten: typeof shorten;
  evaluate: typeof evaluate;
  findTheme: typeof findTheme;
  getJudgement: typeof getJudgement;
  getKeyPerformanceIndicator: typeof getKeyPerformanceIndicator;
  getWorkHistoryAsGDoc: typeof getWorkHistoryAsGDoc;
  showModal: typeof showModal;
  sortSheet: typeof sortSheet;
  createID: typeof createID;
  createCustomization: typeof createCustomization;
  fetchWithModel: typeof fetchWithModel;
  generateAchievementWithModel: typeof generateAchievementWithModel;
  setActiveCellValue: typeof setActiveCellValue;
  chooseModel: typeof chooseModel;
  compareModels: typeof compareModels;
  viewCurrentModels: typeof viewCurrentModels;
  refreshModelsMenu: typeof refreshModelsMenu;
  setupAPIKeys: typeof setupAPIKeys;
  handleGenerate: typeof handleGenerate;
  include: typeof include;
  generateTableOfContents: typeof generateTableOfContents;
};

global.onOpen = onOpen;
global.fetch = fetch;
global.shorten = shorten;
global.evaluate = evaluate;
global.findTheme = findTheme;
global.getJudgement = getJudgement;
global.getKeyPerformanceIndicator = getKeyPerformanceIndicator;
global.getWorkHistoryAsGDoc = getWorkHistoryAsGDoc;
global.showModal = showModal;
global.sortSheet = sortSheet;
global.createID = createID;
global.createCustomization = createCustomization;
global.fetchWithModel = fetchWithModel;
global.generateAchievementWithModel = generateAchievementWithModel;
global.setActiveCellValue = setActiveCellValue;
global.chooseModel = chooseModel;
global.compareModels = compareModels;
global.viewCurrentModels = viewCurrentModels;
global.refreshModelsMenu = refreshModelsMenu;
global.setupAPIKeys = setupAPIKeys;
global.handleGenerate = handleGenerate;
global.include = include;
global.generateTableOfContents = generateTableOfContents;
