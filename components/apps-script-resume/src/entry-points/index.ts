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
 * Generates CV version first, then LinkedIn version, writing to each column automatically.
 */
export function fetch(): void {
  try {
    const services = initializeServices();
    const { row, headers, rowIndex } = services.sheet.getActiveRowData(CONFIG.SHEETS.STORY_BANK);

    const cvColIndex = headers.findIndex((h) => h && String(h).toLowerCase().includes('cv'));
    const linkedinColIndex = headers.findIndex(
      (h) => h && String(h).toLowerCase().includes('linkedin')
    );

    if (cvColIndex < 0 && linkedinColIndex < 0) {
      DialogService.showAlert('Could not find CV or LinkedIn columns in sheet headers.');
      return;
    }

    const requiredCols = [
      CONFIG.COLUMNS.STORY_BANK.CHALLENGE,
      CONFIG.COLUMNS.STORY_BANK.ACTIONS,
      CONFIG.COLUMNS.STORY_BANK.RESULT,
    ];
    const missingCols = requiredCols.filter((c) => headers.indexOf(c) < 0);
    if (missingCols.length > 0) {
      DialogService.showAlert(
        `Missing required column(s): ${missingCols.join(', ')}. Check header row spelling.`
      );
      return;
    }

    const challenge = row[headers.indexOf(CONFIG.COLUMNS.STORY_BANK.CHALLENGE)] as string;
    const actions = row[headers.indexOf(CONFIG.COLUMNS.STORY_BANK.ACTIONS)] as string;
    const result = row[headers.indexOf(CONFIG.COLUMNS.STORY_BANK.RESULT)] as string;
    const client = row[headers.indexOf(CONFIG.COLUMNS.STORY_BANK.CLIENT)] as boolean;

    if (cvColIndex >= 0) {
      Logger.log(`Generating CV summary for row ${rowIndex}, col ${cvColIndex + 1}`);
      const cvSummary = services.achievement.generateAchievement(
        challenge,
        actions,
        result,
        client,
        'cv'
      );
      services.sheet.setCellValue(CONFIG.SHEETS.STORY_BANK, rowIndex, cvColIndex + 1, cvSummary);
      Logger.log(`CV summary written: ${cvSummary.length} chars`);
    } else {
      Logger.warn('CV column not found — skipping CV generation');
    }

    if (linkedinColIndex >= 0) {
      try {
        Logger.log(`Generating LinkedIn summary for row ${rowIndex}, col ${linkedinColIndex + 1}`);
        const linkedinSummary = services.achievement.generateAchievement(
          challenge,
          actions,
          result,
          client,
          'linkedin'
        );
        services.sheet.setCellValue(
          CONFIG.SHEETS.STORY_BANK,
          rowIndex,
          linkedinColIndex + 1,
          linkedinSummary
        );
        Logger.log(`LinkedIn summary written: ${linkedinSummary.length} chars`);
      } catch (linkedinError) {
        Logger.warn(`LinkedIn generation failed: ${(linkedinError as Error).message}`);
        DialogService.showAlert(
          `CV saved. LinkedIn generation failed: ${(linkedinError as Error).message}`
        );
      }
    } else {
      Logger.warn('LinkedIn column not found — skipping LinkedIn generation');
    }
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

function checkIsReasoningModel(modelId: string): boolean {
  return (
    modelId.includes('deepseek') ||
    modelId.includes('gpt-5.5') ||
    modelId.includes('gemini-3.') ||
    /\/o\d/.test(modelId)
  );
}

/**
 * Generate achievement using specific model
 * @param modelName - Name of model ('claude', 'gemini', 'openai', 'mistral', 'cohere')
 */
export function fetchWithModel(modelName: string): void {
  try {
    const services = initializeServices();
    const { row, headers, rowIndex } = services.sheet.getActiveRowData(CONFIG.SHEETS.STORY_BANK);

    const cvColIndex = headers.findIndex((h) => h && String(h).toLowerCase().includes('cv'));
    const linkedinColIndex = headers.findIndex(
      (h) => h && String(h).toLowerCase().includes('linkedin')
    );

    const challenge = row[headers.indexOf(CONFIG.COLUMNS.STORY_BANK.CHALLENGE)] as string;
    const actions = row[headers.indexOf(CONFIG.COLUMNS.STORY_BANK.ACTIONS)] as string;
    const result = row[headers.indexOf(CONFIG.COLUMNS.STORY_BANK.RESULT)] as string;
    const client = row[headers.indexOf(CONFIG.COLUMNS.STORY_BANK.CLIENT)] as boolean;

    for (const [audience, colIndex] of [
      ['cv', cvColIndex],
      ['linkedin', linkedinColIndex],
    ] as [string, number][]) {
      if (colIndex < 0) {
        Logger.warn(`fetchWithModel: ${audience} column not found — skipping`);
        continue;
      }
      const modelId = services.ai['modelMap'][modelName] ?? '';
      const baseTokens =
        audience === 'linkedin'
          ? CONFIG.AI.MAX_TOKENS.ACHIEVEMENT_LINKEDIN
          : CONFIG.AI.MAX_TOKENS.ACHIEVEMENT_CV;
      const maxTokens = checkIsReasoningModel(modelId)
        ? CONFIG.AI.MAX_TOKENS.ACHIEVEMENT_REASONING
        : baseTokens;

      Logger.log(
        `fetchWithModel(${modelName}): generating ${audience}, col ${colIndex + 1}, maxTokens=${maxTokens}`
      );

      const prompt = services.achievement.buildPrompt(challenge, actions, result, client, audience);
      const response = services.ai.query(prompt, { provider: modelName, maxTokens });
      services.sheet.setCellValue(CONFIG.SHEETS.STORY_BANK, rowIndex, colIndex + 1, response);
      Logger.log(`fetchWithModel(${modelName}): ${audience} written, ${response.length} chars`);
    }
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

    const targetAudience = 'cv';

    Logger.log(`generateAchievementWithModel(${modelName}): audience=${targetAudience}`);

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

    // Reasoning models need a flat high cap — their thinking chain alone can consume thousands
    // of tokens before producing the final answer; scaling from the small output budget doesn't work
    const modelId = services.ai['modelMap'][modelName];
    const isReasoning = !!modelId && checkIsReasoningModel(modelId);

    const maxTokens = isReasoning
      ? CONFIG.AI.MAX_TOKENS.ACHIEVEMENT_REASONING
      : CONFIG.AI.MAX_TOKENS.ACHIEVEMENT_CV;

    Logger.log(`generateAchievementWithModel: maxTokens=${maxTokens} (reasoning=${isReasoning})`);

    const config = {
      provider: modelName,
      model: services.ai['modelMap'][modelName] || '',
      maxTokens: maxTokens,
      targetAudience: targetAudience,
      columnHeader: CONFIG.COLUMNS.STORY_BANK.CV,
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
 * Log model choice and all outputs to "AI Feedback" sheet for RLHF
 * Called fire-and-forget from sidebar after user clicks "Choose This"
 * @param chosenModelId - Key of chosen model (e.g. 'claude')
 * @param rationale - Optional notes from user
 * @param allOutputs - Map of model key → generated text for all models
 */
export function logModelChoice(
  chosenModelId: string,
  rationale: string,
  allOutputs: Record<string, string>
): void {
  try {
    const services = initializeServices();
    const { rowIndex } = services.sheet.getActiveRowData(CONFIG.SHEETS.STORY_BANK);

    const FEEDBACK_SHEET = 'AI Feedback';
    const HEADERS = [
      'Timestamp',
      'Story Row',
      'Chosen Model',
      'Rationale',
      'Claude',
      'Gemini',
      'GPT',
      'Mistral',
      'Cohere',
    ];

    const sheet = services.sheet.ensureSheet(FEEDBACK_SHEET);

    if (sheet.getLastRow() === 0) {
      sheet.appendRow(HEADERS);
    }

    const row = [
      new Date().toISOString(),
      rowIndex,
      chosenModelId,
      rationale || '',
      allOutputs['claude'] || '',
      allOutputs['gemini'] || '',
      allOutputs['openai'] || '',
      allOutputs['mistral'] || '',
      allOutputs['cohere'] || '',
    ];

    sheet.appendRow(row);
    Logger.log(`logModelChoice: ${chosenModelId} row=${rowIndex}`);
  } catch (error) {
    Logger.error('Error in logModelChoice', error as Error);
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
    const models = (services.ai as unknown as Record<string, unknown>)['modelMap'] as Record<
      string,
      string
    >;

    const claudeModel = models['claude'] || CONFIG.AI.FALLBACK_MODELS.CLAUDE;
    const openaiModel = models['openai'] || CONFIG.AI.FALLBACK_MODELS.OPENAI;
    const mistralModel = models['mistral'] || CONFIG.AI.FALLBACK_MODELS.MISTRAL;
    const cohereModel = models['cohere'] || CONFIG.AI.FALLBACK_MODELS.COHERE;

    const fmt = (id: string): string => {
      const parts = id.split('/');
      const model = parts[1] || id;
      return model
        .replace(/-/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase())
        .substring(0, 50);
    };

    const claudeDisplay = fmt(claudeModel);
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
    .notes-input{width:100%;box-sizing:border-box;margin-top:8px;padding:6px;border:1px solid #ddd;border-radius:4px;font-size:12px;font-family:Arial,sans-serif;resize:vertical;min-height:48px;display:none}
    .run-btn{padding:10px 28px;background:#1a73e8;color:white;border:none;border-radius:6px;font-size:15px;font-weight:600;cursor:pointer;margin-bottom:10px}
    .run-btn:hover{background:#1557b0}
    .run-btn:disabled{background:#ccc;cursor:not-allowed}
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
      <button class="run-btn" id="runBtn" onclick="startComparison()">&#9654; Run Comparison</button>
      <div id="status" class="status"></div>
    </div>
    <div class="results" id="results" style="display:none">
      <div class="result-card" id="resultClaude">
        <h4>🤖 ${claudeDisplay}</h4>
        <div class="model-label">${claudeModel}</div>
        <div class="result-content" id="contentClaude"><div class="loading">Pending...</div></div>
        <div class="char-count" id="countClaude"></div>
        <div class="metadata" id="metadataClaude"></div>
        <textarea class="notes-input" id="notesClaude" placeholder="Notes..."></textarea>
        <button class="choose-btn" id="chooseClaude" onclick="chooseModel('claude')">✓ Choose This</button>
      </div>
      <!-- Gemini disabled: re-add result-card div here to re-enable -->
      <div class="result-card" id="resultOpenAI">
        <h4>💬 ${openaiDisplay}</h4>
        <div class="model-label">${openaiModel}</div>
        <div class="result-content" id="contentOpenAI"><div class="loading">Pending...</div></div>
        <div class="char-count" id="countOpenAI"></div>
        <div class="metadata" id="metadataOpenAI"></div>
        <textarea class="notes-input" id="notesOpenAI" placeholder="Notes..."></textarea>
        <button class="choose-btn" id="chooseOpenAI" onclick="chooseModel('openai')">✓ Choose This</button>
      </div>
      <div class="result-card" id="resultMistral">
        <h4>⚡ ${mistralDisplay}</h4>
        <div class="model-label">${mistralModel}</div>
        <div class="result-content" id="contentMistral"><div class="loading">Pending...</div></div>
        <div class="char-count" id="countMistral"></div>
        <div class="metadata" id="metadataMistral"></div>
        <textarea class="notes-input" id="notesMistral" placeholder="Notes..."></textarea>
        <button class="choose-btn" id="chooseMistral" onclick="chooseModel('mistral')">✓ Choose This</button>
      </div>
      <div class="result-card" id="resultCohere">
        <h4>🔷 ${cohereDisplay}</h4>
        <div class="model-label">${cohereModel}</div>
        <div class="result-content" id="contentCohere"><div class="loading">Pending...</div></div>
        <div class="char-count" id="countCohere"></div>
        <div class="metadata" id="metadataCohere"></div>
        <textarea class="notes-input" id="notesCohere" placeholder="Notes..."></textarea>
        <button class="choose-btn" id="chooseCohere" onclick="chooseModel('cohere')">✓ Choose This</button>
      </div>
    </div>
  </div>
  <script>
    const MODELS=[
      {key:'claude',contentId:'contentClaude',countId:'countClaude',cardId:'resultClaude',buttonId:'chooseClaude',metadataId:'metadataClaude',notesId:'notesClaude'},
      // Gemini disabled: re-add {key:'gemini',...} here to re-enable
      {key:'openai',contentId:'contentOpenAI',countId:'countOpenAI',cardId:'resultOpenAI',buttonId:'chooseOpenAI',metadataId:'metadataOpenAI',notesId:'notesOpenAI'},
      {key:'mistral',contentId:'contentMistral',countId:'countMistral',cardId:'resultMistral',buttonId:'chooseMistral',metadataId:'metadataMistral',notesId:'notesMistral'},
      {key:'cohere',contentId:'contentCohere',countId:'countCohere',cardId:'resultCohere',buttonId:'chooseCohere',metadataId:'metadataCohere',notesId:'notesCohere'}
    ];
    var modelResults={};
    function startComparison(){
      var btn=document.getElementById('runBtn');
      btn.disabled=true;
      btn.innerHTML='Running...';
      document.getElementById('results').style.display='grid';
      runComparison();
    }
    function runComparison(){
      var status=document.getElementById('status');
      status.textContent='Generating all models...';
      status.style.display='block';
      MODELS.forEach(function(m){
        document.getElementById(m.contentId).innerHTML='<div class="loading">Pending...</div>';
        document.getElementById(m.countId).textContent='';
        document.getElementById(m.metadataId).style.display='none';
        document.getElementById(m.cardId).classList.remove('winner');
        document.getElementById(m.buttonId).style.display='none';
        document.getElementById(m.notesId).value='';
        document.getElementById(m.notesId).style.display='none';
        var h=document.getElementById(m.cardId).querySelector('h4');
        var b=h.querySelector('.winner-badge');if(b)b.remove();
      });
      modelResults={};
      var completed=0;
      var TIMEOUT_MS=60000;
      var STAGGER_MS=1500;
      MODELS.forEach(function(m,i){
        setTimeout(function(){
          document.getElementById(m.contentId).innerHTML='<div class="loading">Generating...</div>';
          var timer=setTimeout(function(){
            if(!modelResults[m.key]){
              document.getElementById(m.contentId).innerHTML='<div style="color:#e67e22;font-style:italic">⏱ Timed out after 60s</div>';
              completed++;
              if(completed===MODELS.length){status.textContent='Completed with timeouts';status.className='status error';var b=document.getElementById('runBtn');b.disabled=false;b.innerHTML='&#9654; Run Again';}
              else{status.textContent='Generating... ('+completed+'/'+MODELS.length+')';}
            }
          },TIMEOUT_MS);
          google.script.run
            .withSuccessHandler(function(result){
              clearTimeout(timer);
              modelResults[m.key]=result;
              displayResult(m.contentId,m.countId,result,m.key);
              completed++;
              if(completed===MODELS.length){finishComparison(modelResults);status.textContent='All models completed!';status.className='status';var b=document.getElementById('runBtn');b.disabled=false;b.innerHTML='&#9654; Run Again';}
              else{status.textContent='Generating... ('+completed+'/'+MODELS.length+')';}
            })
            .withFailureHandler(function(error){
              clearTimeout(timer);
              document.getElementById(m.contentId).innerHTML='<div style="color:red">Error: '+error.message+'</div>';
              completed++;
              if(completed===MODELS.length){status.textContent='Completed with errors';status.className='status error';var b=document.getElementById('runBtn');b.disabled=false;b.innerHTML='&#9654; Run Again';}
              else{status.textContent='Generating... ('+completed+'/'+MODELS.length+')';}
            })
            .generateAchievementWithModel(m.key);
        },i*STAGGER_MS);
      });
    }
    function chooseModel(key){
      var m=MODELS.find(function(x){return x.key===key;});
      if(!m){alert('Model not found');return;}
      var r=modelResults[key];
      if(!r||!r.text){alert('No result available');return;}
      var btn=document.getElementById(m.buttonId);
      var notes=document.getElementById(m.notesId).value||'';
      var allOutputs={};
      MODELS.forEach(function(x){allOutputs[x.key]=(modelResults[x.key]&&modelResults[x.key].text)||'';});
      btn.disabled=true;btn.textContent='Applying...';
      google.script.run
        .withSuccessHandler(function(){btn.textContent='✓ Applied!';btn.classList.add('success');setTimeout(function(){google.script.host.close();},1000);})
        .withFailureHandler(function(e){btn.disabled=false;btn.textContent='✓ Choose This';alert('Error: '+e.message);})
        .setActiveCellValue(r.text);
      google.script.run.logModelChoice(key,notes,allOutputs);
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
        +'<div class="metadata-row"><span class="metadata-label">Prompt:</span><a class="prompt-link" onclick="showPrompt(&quot;'+key+'&quot;)">View Full Prompt</a></div>';
      el.style.display='block';
      document.getElementById(m.notesId).style.display='block';
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
    window.addEventListener('load', startComparison);
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

/**
 * Extract Situation and Task from challenge text using AI
 * Menu item: "Extract Situation & Task"
 */
export function extractSituationAndTasks(): void {
  try {
    const services = initializeServices();
    const { row, headers } = services.sheet.getActiveRowData(CONFIG.SHEETS.STORY_BANK);
    const challenge = row[headers.indexOf(CONFIG.COLUMNS.STORY_BANK.CHALLENGE)] as string;

    if (!challenge) {
      DialogService.showAlert('No Challenge text found in this row.');
      return;
    }

    const result = services.achievement.extractSituationAndTasks(challenge);
    const [situation, task] = result.split('|').map((s) => s.trim());

    SpreadsheetApp.getUi().alert(
      'Situation & Task',
      `SITUATION:\n${situation ?? result}\n\nTASK:\n${task ?? '(not separated)'}`,
      SpreadsheetApp.getUi().ButtonSet.OK
    );
  } catch (error) {
    Logger.error('Error in extractSituationAndTasks', error as Error);
    DialogService.showAlert(`Error extracting situation and tasks: ${(error as Error).message}`);
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
  logModelChoice: typeof logModelChoice;
  chooseModel: typeof chooseModel;
  compareModels: typeof compareModels;
  viewCurrentModels: typeof viewCurrentModels;
  refreshModelsMenu: typeof refreshModelsMenu;
  setupAPIKeys: typeof setupAPIKeys;
  handleGenerate: typeof handleGenerate;
  include: typeof include;
  generateTableOfContents: typeof generateTableOfContents;
  extractSituationAndTasks: typeof extractSituationAndTasks;
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
global.logModelChoice = logModelChoice;
global.chooseModel = chooseModel;
global.compareModels = compareModels;
global.viewCurrentModels = viewCurrentModels;
global.refreshModelsMenu = refreshModelsMenu;
global.setupAPIKeys = setupAPIKeys;
global.handleGenerate = handleGenerate;
global.include = include;
global.generateTableOfContents = generateTableOfContents;
global.extractSituationAndTasks = extractSituationAndTasks;
