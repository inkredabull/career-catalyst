function randomIntFromInterval(min, max) {
  return Math.floor(Math.random() * (max - min + 1) + min)
}


function pause(){
  const MIN_IN_MILLIS = 1250;
  var msToSleep = randomIntFromInterval(MIN_IN_MILLIS, MIN_IN_MILLIS + 1500);
  Logger.log("Sleeping %s ms", msToSleep)
  Utilities.sleep(msToSleep);
  Logger.log("Woke up!")
}

function openUrls() {
  
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = spreadsheet.getActiveSheet()

  // var event = sheet.getName()
  // Logger.log("Event: %s", event);

  // appendData(FOLLOWUP_FILE_ID, event)

  var dataRange = sheet.getDataRange();

  var displayValues = dataRange.getValues();

  // var startCell = 'B2'; // Set your starting cell here
  var startColumn = 1; // sheet.getRange(startCell).getColumn();
  var startRow = 1; // sheet.getRange(startCell).getRow();
  // var numRows = 10; // Number of rows to process
  var urls = [];
  
  // var range = sheet.getRange(startRow, startColumn, sheet.getLastRow() - startRow + 1, 1);
  // var filter = range.getFilter();
  // if (!filter) {
  //   SpreadsheetApp.getUi().alert('No filter set on the range. Please set a filter and try again.');
  //   return;
  // }
  
  // // Getting the range values after filter is applied
  // var displayValues = filter.getRange().getDisplayValues();

  var linkedinIndex = 0;
  var eventIndex = 1;
  var offset = 8
  var length = (true) ? 3 : 1;
  
  for (var i = offset; i < offset + length; i++) {
    // Logger.log(displayValues[i][linkedinIndex])
    // if (displayValues[i][linkedinIndex] && displayValues[startRow - 1 + i][linkedinIndex] !== "") {
      // Logger.log(displayValues[i][linkedinIndex])
      var url = displayValues[i][linkedinIndex];
      var event = displayValues[i][eventIndex];
      // if (url && /^https?:\/\//i.test(url)) { // Simple validation for URLs
      //   urls.push(url);
      // }

      openModal(url, event);
      pause();
    // }
  }


// https://stackoverflow.com/questions/10744760/google-apps-script-to-open-a-url/54675103#54675103
// https://webapps.stackexchange.com/questions/139388/open-multiple-urls-in-different-new-browser-tabs

function openModal(url, event){
  let tabbedHTML = `
    <!DOCTYPE html>
    <html>
      <head>
      <base target="_blank">
        <script>
          const tabbedURL = '${url}';
          
          localStorage.setItem('event', '${event}');

          const winRef = window.open(tabbedURL);

          winRef ? google.script.host.close() : window.alert('Allow popup to redirect you to ' + tabbedURL) ;
          window.onload=function(){
            document.getElementById('url').href = tabbedURL;
            console.log('**************');
            console.log(localStorage.getItem('event'));
            console.log('**************');
          }
        </script>
      </head>
      <body>
        Kindly allow pop ups</br>
        Or <a id='url'>Click here </a>to continue!!!
      </body>
    </html>
    `;

  SpreadsheetApp.getUi()
   .showModalDialog(
     HtmlService.createHtmlOutput(tabbedHTML).setHeight(50),
     'Opening ...'
   )
}  

  // Logger.log(urls)
  // return
  
  // if (urls.length === 0) {
  //   SpreadsheetApp.getUi().alert('No URLs found in the specified range.');
  //   return;
  // }



  // Create an HTML file with the URLs and display it in a dialog
  // var htmlOutput = HtmlService.createHtmlOutput('<html><body>');
  // htmlOutput.append('<h2>Click on a link to open it in a new tab:</h2>');
  // urls.forEach(function(url) {
  //   htmlOutput.append(`<a href="${url}" target="_blank" onclick="google.script.host.close()">${url}</a><br>`);
  // });
  // htmlOutput.append('</body></html>');
  // SpreadsheetApp.getUi().showModalDialog(htmlOutput, 'Open URLs');
}