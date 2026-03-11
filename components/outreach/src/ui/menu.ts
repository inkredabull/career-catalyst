export function onOpen(): void {
  SpreadsheetApp.getUi()
    .createMenu('Outreach')
    .addItem('Generate Message', 'generateMessageForRow')
    .addToUi();
}
