// Background script for the Voice Assistant Extension
// Handles communication between content scripts and the backend server

// Configuration
const config = {
  // Server endpoint - can be configured based on environment
  apiUrl: "http://localhost:8000",
  websocketUrl: "ws://localhost:8000/ws"
};

// WebSocket connection
let socket = null;

// Initialize WebSocket connection
function initWebSocket() {
  if (socket && socket.readyState === WebSocket.OPEN) {
    return;
  }
  
  // The correct WebSocket URL based on the backend implementation
  // In main.py, the router is included with prefix "/ws" and in websocketUtil.py the route is also "/ws"
  // So the complete path is /ws/ws
  const wsUrl = "ws://localhost:8000/ws/ws";
  
  try {
    socket = new WebSocket(wsUrl);
    
    socket.onopen = () => {
      console.log("WebSocket connection established");
    };
    
    socket.onmessage = (event) => {
      try {
        const response = JSON.parse(event.data);
        // Forward the response to active tab content script
        forwardWebSocketResponse(response);
      } catch (error) {
        console.error("Error parsing WebSocket message:", error);
      }
    };
    
    socket.onerror = (error) => {
      console.error("WebSocket error:", error);
      console.log("Trying alternative WebSocket URL");
      tryAlternativeWebsocket();
    };
    
    socket.onclose = () => {
      console.log("WebSocket connection closed");
      // Try to reconnect after 5 seconds
      setTimeout(initWebSocket, 5000);
    };
  } catch (error) {
    console.error("Error creating WebSocket:", error);
    tryAlternativeWebsocket();
  }
}

// Try alternative WebSocket URL as fallback
function tryAlternativeWebsocket() {
  try {
    // Try the simpler path without the double /ws/ws
    const alternativeUrl = "ws://localhost:8000/ws";
    console.log("Trying alternative WebSocket URL:", alternativeUrl);
    
    socket = new WebSocket(alternativeUrl);
    
    socket.onopen = () => {
      console.log("WebSocket connection established with alternative URL");
      // Update the config to use this URL in the future
      config.websocketUrl = alternativeUrl;
    };
    
    socket.onmessage = (event) => {
      try {
        const response = JSON.parse(event.data);
        forwardWebSocketResponse(response);
      } catch (error) {
        console.error("Error parsing WebSocket message:", error);
      }
    };
    
    socket.onerror = (error) => {
      console.error("Alternative WebSocket error:", error);
    };
    
    socket.onclose = () => {
      console.log("Alternative WebSocket connection closed");
      // Try to reconnect after 5 seconds
      setTimeout(initWebSocket, 5000);
    };
  } catch (error) {
    console.error("Error creating alternative WebSocket:", error);
  }
}

// Initialize WebSocket when extension loads
initWebSocket();

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
    console.log("=== Processing audio in background script ===");
    console.log(`Audio data size: ${audioData.size || audioData.byteLength} bytes`);
    console.log(`isActivated: ${isActivated}`);
    
    // Create a blob from the audio data
    const audioBlob = new Blob([audioData], { type: 'audio/webm' });
    console.log(`Created audio blob: ${audioBlob.size} bytes, type: ${audioBlob.type}`);
    
    // Create the form data
    const formData = new FormData();
    formData.append('audio', audioBlob, 'audio.webm');
    
    // Only add request if we have activation state info
    if (typeof isActivated !== 'undefined') {
      const requestData = JSON.stringify({
        is_activated: isActivated
      });
      console.log(`Adding request data: ${requestData}`);
      formData.append('request', requestData);
    }
    
    console.log(`Sending audio to backend API: ${config.apiUrl}/audio`);
    
    try {
      // First try with the API endpoint
      console.log("Attempting API request...");
      const response = await fetch(`${config.apiUrl}/audio`, {
        method: 'POST',
        body: formData
      });
      
      console.log(`API response status: ${response.status}`);
      
      if (response.ok) {
        const responseData = await response.json();
        console.log("API response data:", responseData);
        return responseData;
      } else {
        console.warn("API endpoint failed, status:", response.status);
        const errorText = await response.text();
        console.error("API error text:", errorText);
        throw new Error(`API request failed with status ${response.status}: ${errorText}`);
      }
    } catch (apiError) {
      console.warn("API error, falling back to WebSocket:", apiError);
      
      // Fallback to WebSocket if the API fails
      return new Promise((resolve, reject) => {
        if (socket && socket.readyState === WebSocket.OPEN) {
          console.log("API failed, falling back to WebSocket");
          // Read the blob as arrayBuffer to send via WebSocket
          const reader = new FileReader();
          reader.onload = function() {
            const arrayBuffer = this.result;
            console.log(`Sending audio data via WebSocket, ${arrayBuffer.byteLength} bytes`);
            socket.send(arrayBuffer);
            
            // Set up a temporary message handler
            const originalHandler = socket.onmessage;
            const timeout = setTimeout(() => {
              socket.onmessage = originalHandler;
              console.error("WebSocket response timeout after 10 seconds");
              reject(new Error("WebSocket response timeout"));
            }, 10000); // 10 second timeout
            
            socket.onmessage = function(event) {
              clearTimeout(timeout);
              socket.onmessage = originalHandler;
              
              try {
                console.log("Received WebSocket response:", event.data);
                const response = JSON.parse(event.data);
                console.log("Parsed WebSocket response:", response);
                resolve(response);
              } catch (error) {
                console.error("Error parsing WebSocket response:", error);
                reject(new Error("Invalid WebSocket response"));
              }
            };
          };
          reader.onerror = function(error) {
            console.error("Error reading audio data:", error);
            reject(new Error("Could not read audio data"));
          };
          console.log("Reading audio blob as ArrayBuffer");
          reader.readAsArrayBuffer(audioBlob);
        } else {
          console.error("WebSocket not connected, readyState:", socket ? socket.readyState : "socket is null");
          reject(new Error("WebSocket not connected"));
        }
      });
    }
  } catch (error) {
    console.error("Error processing audio:", error);
    throw error;
  }
}

async function analyzePage(pageContent) {
  try {
    console.log("=== Analyzing page in background script ===");
    console.log(`URL: ${pageContent.url}`);
    console.log(`Text length: ${pageContent.text ? pageContent.text.length : 0} chars`);
    console.log(`HTML length: ${pageContent.html ? pageContent.html.length : 0} chars`);
    
    // Create the PageContent object according to schema
    const pageRequest = {
      html: pageContent.html,
      text: pageContent.text,
      url: pageContent.url
    };
    
    console.log(`Sending request to ${config.apiUrl}/analyze_page`);
    
    const response = await fetch(`${config.apiUrl}/analyze_page`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(pageRequest)
    });
    
    console.log(`API response status: ${response.status}`);
    
    if (response.ok) {
      const responseData = await response.json();
      console.log("Received page analysis:", responseData);
      return responseData;
    } else {
      const errorText = await response.text();
      console.error(`API error (${response.status}):`, errorText);
      throw new Error(`API request failed with status ${response.status}: ${errorText}`);
    }
  } catch (error) {
    console.error("Error analyzing page:", error);
    throw error;
  }
}

// For sending messages through WebSocket
function sendWebSocketMessage(message) {
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(message));
  } else {
    console.error("WebSocket not connected");
    initWebSocket(); // Try to reconnect
  }
}

// Function to forward WebSocket responses to the active tab
function forwardWebSocketResponse(response) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs.length > 0) {
      chrome.tabs.sendMessage(tabs[0].id, {
        type: "WEBSOCKET_MESSAGE",
        data: response
      });
    }
  });
}
