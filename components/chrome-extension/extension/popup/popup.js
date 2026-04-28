// Settings Popup Logic

document.addEventListener('DOMContentLoaded', () => {
  const statusDiv = document.getElementById('status');
  const openJobTrackerBtn = document.getElementById('open-job-tracker');

  // Accordion functionality
  const sectionHeaders = document.querySelectorAll('.section-header');

  // Load accordion state from storage
  chrome.storage.local.get(['accordionState'], (result) => {
    const accordionState = result.accordionState || {};

    sectionHeaders.forEach(header => {
      const sectionId = header.getAttribute('data-section');
      const content = document.querySelector(`.section-content[data-section="${sectionId}"]`);

      // Default to expanded if no state saved
      if (accordionState[sectionId] === 'collapsed') {
        header.classList.add('collapsed');
        content.classList.add('collapsed');
      }

      // Add click handler
      header.addEventListener('click', () => {
        const isCollapsed = header.classList.toggle('collapsed');
        content.classList.toggle('collapsed');

        // Save state
        chrome.storage.local.get(['accordionState'], (result) => {
          const currentState = result.accordionState || {};
          currentState[sectionId] = isCollapsed ? 'collapsed' : 'expanded';
          chrome.storage.local.set({ accordionState: currentState });
        });
      });
    });
  });

  // Handle "Open Job Tracker Panel" button
  openJobTrackerBtn.addEventListener('click', () => {
    // Get the active tab
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        // Send message to content script to toggle the gutter
        chrome.tabs.sendMessage(tabs[0].id, { action: 'toggleGutter' }, (response) => {
          if (chrome.runtime.lastError) {
            console.error('Error toggling panel:', chrome.runtime.lastError);
            statusDiv.textContent = 'Error: Content script not loaded';
            statusDiv.className = 'status error';
            setTimeout(() => {
              statusDiv.textContent = '';
            }, 3000);
          } else if (response?.success) {
            console.log('Panel toggled:', response.isOpen ? 'opened' : 'closed');
            // Close the popup after opening the panel
            window.close();
          }
        });
      }
    });
  });
});
