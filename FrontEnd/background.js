// Background script for the Voice Assistant Extension
// Handles communication between content scripts and the backend server

// Configuration
const config = {
  // Server endpoint - can be configured based on environment
  apiUrl: "http://localhost:8000",
  websocketUrl: "ws://localhost:8000/ws"
};

// WebSocket connection
let webSocket = null;
let activeTabId = null;
let navigationOptions = {};
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_DELAY = 2000; // 2秒重连延迟

// Initialize WebSocket connection
function initWebSocket() {
  if (webSocket !== null) {
    webSocket.close();
  }

  try {
    console.log("Connecting to WebSocket at:", config.websocketUrl);
    webSocket = new WebSocket(config.websocketUrl);

    webSocket.onopen = () => {
      console.log("WebSocket connection established");
      reconnectAttempts = 0; // 重置重连计数
    };

    webSocket.onmessage = (event) => {
      const data = JSON.parse(event.data);
      
      // Forward received data to the active tab's content script
      if (activeTabId && data) {
        chrome.tabs.sendMessage(activeTabId, {
          type: "WEBSOCKET_MESSAGE",
          data: data
        });
        
        // Store navigation options if available
        if (data.options) {
          navigationOptions = data.options;
        }
      }
    };

    webSocket.onerror = (error) => {
      console.error("WebSocket error:", error);
    };

    webSocket.onclose = (event) => {
      console.log(`WebSocket connection closed. Code: ${event.code}, Reason: ${event.reason}`);
      
      // 重连逻辑
      if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
        reconnectAttempts++;
        const delay = RECONNECT_DELAY * reconnectAttempts; // 指数退避
        console.log(`Attempting to reconnect (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}) in ${delay}ms...`);
        setTimeout(initWebSocket, delay);
      } else {
        console.log("Maximum reconnection attempts reached. Please check the server or reload.");
      }
    };
  } catch (error) {
    console.error("Error initializing WebSocket:", error);
  }
}

// Initialize WebSocket on startup
initWebSocket();

// Keep track of the active tab
chrome.tabs.onActivated.addListener((activeInfo) => {
  activeTabId = activeInfo.tabId;
});

// Message handlers
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender.tab) {
    activeTabId = sender.tab.id;
  }

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

  if (message.type === "ANALYZE_URL") {
    // Send URL to WebSocket for analysis
    if (webSocket && webSocket.readyState === WebSocket.OPEN) {
      webSocket.send(JSON.stringify({ URL: message.url }));
      sendResponse({ success: true });
    } else {
      // 如果WebSocket没有连接，则尝试重新连接
      initWebSocket();
      sendResponse({ 
        error: "WebSocket connection not available. Attempting to reconnect...",
        retry: true 
      });
    }
    return true;
  }

  if (message.type === "PROCESS_COMMAND") {
    // Process user command against navigation options
    const command = message.command.toLowerCase();
    let found = false;
    
    // Check if command matches any navigation option
    for (const [text, url] of Object.entries(navigationOptions)) {
      if (text.toLowerCase().includes(command) || command.includes(text.toLowerCase())) {
        sendResponse({ 
          type: "URL_COMMAND", 
          url: url,
          text: `Navigating to ${text}`
        });
        found = true;
        break;
      }
    }
    
    // If no match found, send command to backend for processing
    if (!found && webSocket && webSocket.readyState === WebSocket.OPEN) {
      webSocket.send(JSON.stringify({ text: command }));
      sendResponse({ processing: true });
    } else if (!found) {
      sendResponse({ error: "Command not recognized or WebSocket not connected" });
    }
    
    return true;
  }
});

// API functions
async function processAudio(audioData, isActivated) {
  try {
    // First try using WebSocket if it's available
    if (webSocket && webSocket.readyState === WebSocket.OPEN) {
      // Convert Blob to base64
      const reader = new FileReader();
      
      // Create a promise to handle the async FileReader
      const audioBase64Promise = new Promise((resolve, reject) => {
        reader.onload = () => {
          // Remove the metadata prefix (e.g., "data:audio/webm;base64,")
          const base64data = reader.result.split(',')[1];
          resolve(base64data);
        };
        reader.onerror = () => reject(new Error('Failed to read audio data'));
        reader.readAsDataURL(audioData);
      });
      
      const base64data = await audioBase64Promise;
      
      // Send via WebSocket
      webSocket.send(JSON.stringify({ 
        audio: base64data,
        isActivated: isActivated
      }));
      
      // Since WebSocket is async with no direct response,
      // create a temporary response
      return { 
        transcription: "Processing audio via WebSocket...",
        command: {
          type: "NOTIFICATION",
          message: "Audio sent via WebSocket"
        }
      };
    }
    
    // Fallback to REST API
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
    // If connected to WebSocket, send URL
    if (webSocket && webSocket.readyState === WebSocket.OPEN) {
      webSocket.send(JSON.stringify({ URL: pageContent.url }));
      return { success: true };
    }
    
    // Fallback to REST API
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
