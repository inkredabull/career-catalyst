export const onOpen = (): void => {
  SpreadsheetApp.getUi()
    .createMenu('Utils')
    .addItem('Send Emails', 'run_sendEmails')
    .addItem('Send Test Email', 'run_sendTestEmail')
    .addItem('Queue Emails', 'run_queueEmails')
    .addItem('Do lookup', 'run_fetchContactToSheet')
    .addItem('Do lookup (no Zeitgeisty)', 'run_fetchContactMetadataToSheet')
    .addItem('Get Linkedin URL', 'run_getLinkedInUrlToSheet')
    .addItem('Generate Message', 'run_generateMessageForRow')
    .addItem('Refresh Job Metadata', 'run_refreshJobMetadata')
    .addItem('Show Job Metadata', 'run_showJobMetadata')
    .addToUi();
}
