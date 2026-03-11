export function onOpen(): void {
  SpreadsheetApp.getUi()
    .createMenu('Utils')
    .addItem('Send Emails', 'sendEmails')
    .addItem('Queue Emails', 'queueEmails')
    .addItem('Do lookup', 'fetchContactToSheet')
    .addItem('Get Linkedin URL', 'getLinkedInUrlToSheet')
    .addItem('Generate Message', 'generateMessageForRow')
    .addItem('Refresh Job Metadata', 'refreshJobMetadata')
    .addToUi();
}
