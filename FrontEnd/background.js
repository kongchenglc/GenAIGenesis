// Background script for the Voice Assistant Extension
// Handles communication between content scripts and the backend server

// Configuration
const config = {
  // Server endpoint - can be configured based on environment
  apiUrl: "http://localhost:8000",
  websocketUrl: "ws://localhost:8000/ws"
};

// Message handlers
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "SEND_AUDIO") {
    // Forward audio data to the backend
    processAudio(message.audioData, message.isActivated)
      .then(response => sendResponse(response))
      .catch(error => sendResponse({ error: error.message }));
    return true; // Required for async response
  }
  
  if (message.type === "ANALYZE_PAGE") {
    // Forward page content for analysis
    analyzePage(message.pageContent)
      .then(response => sendResponse(response))
      .catch(error => sendResponse({ error: error.message }));
    return true; // Required for async response
  }
});

// API functions
async function processAudio(audioData, isActivated) {
  try {
    const formData = new FormData();
    formData.append('audio', audioData);
    formData.append('isActivated', isActivated);
    
    const response = await fetch(`${config.apiUrl}/audio`, {
      method: 'POST',
      body: formData
    });
    
    return await response.json();
  } catch (error) {
    console.error("Error processing audio:", error);
    throw error;
  }
}

async function analyzePage(pageContent) {
  try {
    const response = await fetch(`${config.apiUrl}/analyze_page`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(pageContent)
    });
    
    return await response.json();
  } catch (error) {
    console.error("Error analyzing page:", error);
    throw error;
  }
}
