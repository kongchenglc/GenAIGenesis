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
    // Process audio data using browser's speech recognition
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
async function processAudio(audioBlob, isActivated) {
  return new Promise((resolve, reject) => {
    try {
      // Debug the actual type of audioBlob
      console.log('Audio blob type:', Object.prototype.toString.call(audioBlob));
      console.log('Is Blob?', audioBlob instanceof Blob);
      
      // Check if we actually have a valid Blob
      if (!(audioBlob instanceof Blob)) {
        console.error('audioBlob is not a valid Blob object', audioBlob);
        // Return a fallback response since we can't process the audio
        resolve({ 
          transcription: "I couldn't process the audio. Please try again."
        });
        return;
      }
      
      // Create a FileReader to read the blob directly
      const reader = new FileReader();
      
      reader.onload = function() {
        // We've got the audio data but can't play it in a background script
        console.log('Audio data processed in background');
        
        // For now, just return a mock transcription
        // In a real implementation, you would:
        // 1. Either send this to a server for transcription
        // 2. Or use WebSpeech API in the content script directly
        
        // Check for wake/stop words based on isActivated flag
        if (!isActivated) {
          const randomNum = Math.random();
          if (randomNum < 0.2) {
            resolve({ command: { type: "WAKE_WORD_DETECTED" } });
            return;
          }
        }
        
        // Just return a sample transcription
        resolve({ 
          transcription: "This is a sample transcription. Please implement proper speech recognition."
        });
      };
      
      reader.onerror = function() {
        console.error('Error reading audio blob');
        reject(new Error('Error reading audio blob'));
      };
      
      // Start reading the blob
      reader.readAsArrayBuffer(audioBlob);
      
    } catch (error) {
      console.error("Error in speech recognition:", error);
      reject(error);
    }
  });
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
