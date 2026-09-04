/**
 * Menu Service - Manages spreadsheet menu items
 *
 * @module ui/MenuService
 */

/**
 * Service for managing menu items
 */
export class MenuService {
  /**
   * Create custom menu in spreadsheet
   * @param ui - Spreadsheet UI object
   */
  static createCustomMenu(ui: GoogleAppsScript.Base.Ui): void {
    ui.createMenu('Utils')
      .addItem('Generate summary', 'fetch')
      .addItem('Choose Model', 'chooseModel')
      .addItem('Compare Models', 'compareModels')
      .addSeparator()
      .addItem('View Current Models', 'viewCurrentModels')
      .addItem('Refresh Models', 'refreshModelsMenu')
      .addSeparator()
      .addItem('Shorten', 'shorten')
      .addItem('Evaluate achievement', 'evaluate')
      .addItem('Categorize', 'findTheme')
      .addItem('Get judgement', 'getJudgement')
      .addItem('Get KPI', 'getKeyPerformanceIndicator')
      .addItem('Get Work History as G Doc', 'getWorkHistoryAsGDoc')
      .addItem('Generate resume', 'showModal')
      .addItem('Sort', 'sortSheet')
      .addItem('Create ID', 'createID')
      .addItem('Customize', 'createCustomization')
      .addSeparator()
      .addItem('Extract Situation & Task', 'extractSituationAndTasks')
      .addItem('Update Table of Contents', 'generateTableOfContents')
      .addToUi();
  }
}
