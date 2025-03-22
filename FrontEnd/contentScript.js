// Create overlay
let voiceOverlay = document.createElement('div');
voiceOverlay.id = 'voice-control-overlay';
voiceOverlay.innerHTML = `
      <div class="voice-status">
          <div class="voice-indicator"></div>
          <span class="status-text">Hold space key to start voice assistant</span>
      </div>
      <div id="recognition-result" class="recognition-result"></div>
  `;
document.body.appendChild(voiceOverlay);

// Add styles
if (!document.getElementById('voice-control-style')) {
    const style = document.createElement('style');
    style.id = 'voice-control-style';
    style.textContent = `
          #voice-control-overlay {
              position: fixed;
              top: 20px;
              right: 20px;
              background: rgba(0, 0, 0, 0.8);
              color: white;
              padding: 10px 20px;
              border-radius: 20px;
              z-index: 999999;
              font-family: Arial, sans-serif;
              display: flex;
              flex-direction: column;
              align-items: flex-start;
              transition: opacity 0.3s;
              max-width: 350px;
          }
          .voice-status {
              display: flex;
              align-items: center;
              gap: 10px;
          }
          .voice-indicator {
              width: 10px;
              height: 10px;
              border-radius: 50%;
              background: #f0ad4e; /* Yellow indicates standby status */
              animation: pulse 1.5s infinite;
          }
          @keyframes pulse {
              0% { transform: scale(1); opacity: 1; }
              50% { transform: scale(1.2); opacity: 0.7; }
              100% { transform: scale(1); opacity: 1; }
          }
          .status-text {
              font-size: 14px;
          }
          .recognition-result {
              margin-top: 10px;
              font-size: 14px;
              width: 100%;
              word-wrap: break-word;
          }
          .recognition-result a {
              color: #4CAF50;
              text-decoration: underline;
          }
          .recognition-result a:hover {
              color: #81C784;
          }
          .recognition-result ol {
              margin: 5px 0;
              padding-left: 20px;
          }
          .recognition-result li {
              margin-bottom: 3px;
          }
      `;
    document.head.appendChild(style);
}

// Long press space key detection variables
let spaceKeyDown = false;
let longPressTimer = null;
const LONG_PRESS_DURATION = 500; // 500ms to trigger long press
let permissionRequested = false;

// Speech recognition variables
let recognition = null;
let isRecognizing = false;
let socket = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;

// Ensure backend connection before establishing WebSocket
async function ensureCertificateAccepted() {
    try {
        updateStatusText('Checking backend connection...');
        
        // Print current domain to help debug cross-origin issues
        const currentDomain = window.location.href;
        console.log('Current page domain:', currentDomain);
        
        // Try to connect to the backend via HTTP
        console.log('Attempting to connect to backend HTTP service...');
        const response = await fetch('http://localhost:8000/', {
            // Add cross-origin headers
            mode: 'cors',
        });
        
        if (response.ok) {
            console.log('HTTP connection successful');
            return true;
        } else {
            console.warn('HTTP connection status not OK:', response.status, response.statusText);
            return false;
        }
    } catch (error) {
        console.error('HTTP connection failed, detailed error:', error);
        
        // More detailed error message
        const resultDiv = document.getElementById('recognition-result');
        resultDiv.innerHTML = `
            <div>Error: Cannot connect to backend server</div>
            <div>Current page: ${window.location.href}</div>
            <div>Error message: ${error.message}</div>
            <div>Possible causes:</div>
            <ol>
                <li>Backend server not running: Ensure python main.py is executing</li>
                <li>Backend server might be using HTTPS instead of HTTP: Please modify backend code to use HTTP</li>
                <li>Permission issue: Check if manifest.json has appropriate permissions</li>
                <li>Cross-origin issue: You're currently on ${window.location.origin} domain trying to access localhost</li>
                <li>Port in use: Ensure port 8000 is not being used by another program</li>
            </ol>
        `;
        
        return false;
    }
}

// Initialize WebSocket connection
async function initializeWebSocket() {
    if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
        return;
    }
    
    try {
        updateStatusText('Connecting to server...');
        
        // Ensure connection is available
        const connectionOk = await ensureCertificateAccepted();
        if (!connectionOk) {
            updateStatusText('Cannot connect to backend server');
            updateIndicatorColor('#F44336'); // Red indicates error
            return;
        }
        
        // WebSocket URL using ws instead of wss (HTTP instead of HTTPS)
        const wsUrl = 'ws://localhost:8000/ws';
        console.log('Attempting to connect to WebSocket server:', wsUrl);
        
        socket = new WebSocket(wsUrl);
        
        socket.onopen = () => {
            console.log('WebSocket connection established');
            // Send initialization message
            socket.send(JSON.stringify({
                type: 'init',
                client: 'chrome-extension'
            }));
            reconnectAttempts = 0;
            
            if (!isRecognizing) {
                updateStatusText('Connected, hold space key to start voice assistant');
            } else {
                updateStatusText('Listening...');
            }
        };
        
        socket.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                console.log('Received message from server:', data);
                
                if (data.error) {
                    console.error('Error from server:', data.error);
                    document.getElementById('recognition-result').textContent = `Server error: ${data.error}`;
                    updateStatusText('Error from server');
                    updateIndicatorColor('#F44336'); // Red indicates error
                    return;
                }
                
                // Special handling for command object structure
                if (data.command && typeof data.command === 'object') {
                    console.log('Processing command object:', data.command);
                    
                    // Check for analyze_page command specifically
                    if (data.command.originalText === "analyze_page" || 
                        data.command.originalText === "analyze page" || 
                        data.command.originalText === "analyze this page") {
                        console.log('Direct analyze_page command detected in command object');
                        analyzePageContent();
                        return;
                    }
                    
                    // If it's a PAGE_ANALYSIS command, execute it
                    if (data.command.type === 'PAGE_ANALYSIS') {
                        console.log('PAGE_ANALYSIS command received, executing analyze_page');
                        analyzePageContent();
                        return;
                    }
                }
                
                // Handle different message types
                if (data.type === 'URL_COMMAND') {
                    displayRecognitionResult(data);
                } 
                else if (data.type === 'PAGE_ANALYSIS_RESULT') {
                    console.log('Received page analysis result:', data);
                    updateStatusText('Analysis complete');
                    updateIndicatorColor('#4CAF50'); // Green indicates success
                    
                    // Check if there was an error during analysis
                    if (data.error) {
                        console.error('Error in page analysis:', data.error);
                        
                        // Still display what we got, even with error
                        displayPageAnalysisResults({
                            main_content: data.main_content || 'Error analyzing page content',
                            actions: data.actions || []
                        });
                    } else {
                        displayPageAnalysisResults(data);
                    }
                } 
                else if (data.type === 'EXECUTE_ACTION') {
                    // Log received command details
                    console.log('Executing action command:', data);
                    
                    // Special handling for analyze_page action
                    if (data.action_type === 'analyze_page') {
                        console.log('Analyze page action received');
                        analyzePageContent();
                        return;
                    }
                    
                    // Execute other actions
                    executeAction(
                        data.action_type, 
                        data.target, 
                        data.value || '', 
                        data.element_type || 'unknown',
                        data.element_attributes || {}
                    );
                } 
                // Handle legacy analysis_result format for backward compatibility
                else if (data.type === 'analysis_result' && data.result) {
                    console.log('Received legacy page analysis result:', data.result);
                    updateStatusText('Analysis complete');
                    updateIndicatorColor('#4CAF50'); // Green indicates success
                    displayPageAnalysisResults(data.result);
                }
                else {
                    displayRecognitionResult(data);
                }
                
            } catch (error) {
                console.error('Error processing message:', error, event.data);
                document.getElementById('recognition-result').textContent = `Error processing message: ${error.message}`;
                updateStatusText('Error processing message');
                updateIndicatorColor('#F44336'); // Red indicates error
            }
        };
        
        socket.onclose = (event) => {
            console.log(`WebSocket connection closed: code=${event.code} reason=${event.reason}`);
            
            if (!isRecognizing) {
                updateStatusText('Server connection lost');
            }
            
            // Try to reconnect if not normal closure
            if (event.code !== 1000 && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
                reconnectAttempts++;
                console.log(`Attempting to reconnect (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})...`);
                updateStatusText(`Reconnecting (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})...`);
                setTimeout(initializeWebSocket, 2000);
            } else if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
                updateStatusText('Cannot connect to server, please check if backend is running');
                updateIndicatorColor('#F44336'); // Red indicates connection failure
                
                const resultDiv = document.getElementById('recognition-result');
                resultDiv.innerHTML = `
                    <div>Error: WebSocket connection failed.</div>
                    <div>Please ensure:</div>
                    <ol>
                        <li>Backend server is running (python main.py)</li>
                        <li>Backend server uses HTTP instead of HTTPS (correctly configured as ws://)</li>
                        <li>Chrome extension has microphone access permission</li>
                    </ol>
                `;
            }
        };
        
        socket.onerror = (error) => {
            console.error('WebSocket error:', error);
            updateStatusText('Connection error, please ensure backend server is running');
            updateIndicatorColor('#F44336'); // Red indicates error
            
            const resultDiv = document.getElementById('recognition-result');
            resultDiv.innerHTML = `
                <div>Error: WebSocket connection failed.</div>
                <div>Please ensure:</div>
                <ol>
                    <li>Backend server is running (python main.py)</li>
                    <li>Backend server uses HTTP instead of HTTPS (correctly configured as ws://)</li>
                    <li>Chrome extension has microphone access permission</li>
                </ol>
            `;
        };
    } catch (error) {
        console.error('Failed to initialize WebSocket:', error);
        updateStatusText('Connection failed, please try again');
        updateIndicatorColor('#F44336'); // Red indicates error
    }
}

// Update status text
function updateStatusText(text) {
    const statusTextElement = document.querySelector('.status-text');
    if (statusTextElement) {
        statusTextElement.textContent = text;
    }
}

// Update indicator color
function updateIndicatorColor(color) {
    const indicatorElement = document.querySelector('.voice-indicator');
    if (indicatorElement) {
        indicatorElement.style.background = color;
    }
}

// Display recognition results
function displayRecognitionResult(data) {
    const resultDiv = document.getElementById('recognition-result');
    const overlay = document.getElementById('voice-control-overlay');
    
    if (data.command) {
        if (data.command.type === 'GENERAL_COMMAND') {
            resultDiv.textContent = `Recognition result: ${data.command.text}`;
        } else if (data.command.type === 'URL_COMMAND') {
            // Display the recognition result
            resultDiv.textContent = `Opening website: ${data.command.url}`;
            
            // Add animation effect to the overlay
            overlay.classList.add('url-command-notification');
            
            // Remove the class after animation completes
            setTimeout(() => {
                overlay.classList.remove('url-command-notification');
            }, 2000);
            
            // Actually navigate to the URL
            console.log('Navigating to URL:', data.command.url);
            
            // Short delay to allow the user to see the notification
            setTimeout(() => {
                window.location.href = data.command.url;
            }, 1000);
        } else if (data.command.type === 'WAKE_WORD_DETECTED') {
            resultDiv.textContent = `Recognition result: Wake word detected`;
        } else if (data.command.type === 'STOP_WORD_DETECTED') {
            resultDiv.textContent = `Recognition result: Stop word detected`;
        } else if (data.command.originalText) {
            resultDiv.textContent = `Recognition result: ${data.command.originalText}`;
        } else {
            resultDiv.textContent = `Recognition result: ${JSON.stringify(data.command)}`;
        }
    } else if (data.error) {
        resultDiv.textContent = `Error: ${data.error}`;
    } else {
        resultDiv.textContent = 'No recognition result';
    }
}

// Initialize speech recognition
function initializeSpeechRecognition() {
    // Check if browser supports speech recognition
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
        updateStatusText('Speech recognition not supported in this browser');
        updateIndicatorColor('#F44336'); // Red indicates error
        return false;
    }
    
    // Create speech recognition instance
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognition = new SpeechRecognition();
    
    // Configure speech recognition - English only
    recognition.lang = 'en-US';
    console.log('Using English (en-US) for speech recognition');
    
    recognition.continuous = true;
    recognition.interimResults = true;
    
    // Add event handlers
    recognition.onstart = () => {
        isRecognizing = true;
        updateStatusText('Listening...');
        updateIndicatorColor('#4CAF50'); // Green indicates active
        console.log('Speech recognition started');
    };
    
    recognition.onresult = (event) => {
        const result = event.results[event.results.length - 1];
        const transcript = result[0].transcript.trim();
        
        // Display interim results
        if (!result.isFinal) {
            document.getElementById('recognition-result').textContent = `Hearing: ${transcript}`;
            return;
        }
        
        // Final result
        console.log('Speech recognized:', transcript);
        
        // Send to backend
        if (transcript.length > 0) {
            sendTextToBackend(transcript);
        }
    };
    
    recognition.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        if (event.error === 'not-allowed') {
            updateStatusText('Microphone access denied');
            updateIndicatorColor('#F44336'); // Red indicates error
            permissionRequested = false;
        } else {
            updateStatusText(`Recognition error: ${event.error}`);
            updateIndicatorColor('#F44336'); // Red indicates error
        }
    };
    
    recognition.onend = () => {
        isRecognizing = false;
        updateStatusText('Recognition stopped');
        updateIndicatorColor('#f0ad4e'); // Yellow indicates standby
        console.log('Speech recognition ended');
    };
    
    return true;
}

// Request microphone permission function
async function requestMicrophonePermission() {
    if (permissionRequested) return true;
    
    try {
        // Update UI status
        updateStatusText('Requesting microphone permission...');
        updateIndicatorColor('#f0ad4e'); // Yellow indicates processing
        
        // Try to request microphone permission
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        permissionRequested = true;

        // If permission is granted, update overlay status
        console.log('Microphone permission granted');
        updateStatusText('Microphone permission granted');
        updateIndicatorColor('#4CAF50'); // Green indicates success

        // Notify background.js that permission is granted
        chrome.runtime.sendMessage({ type: 'PERMISSION_GRANTED' });
        
        // Close the stream since we don't need it for Web Speech API
        stream.getTracks().forEach(track => track.stop());
        
        return true;
    } catch (error) {
        // Update overlay status if request fails
        console.error('Microphone permission denied:', error);
        updateStatusText('Microphone permission denied, please try again');
        updateIndicatorColor('#F44336'); // Red indicates failure
        permissionRequested = false;

        // Notify background.js that permission is denied
        chrome.runtime.sendMessage({ type: 'PERMISSION_DENIED' });

        // Display different messages based on error type
        if (error.name === 'NotAllowedError') {
            console.log('User denied microphone permission');
        } else if (error.name === 'NotFoundError') {
            console.log('No microphone device found');
            updateStatusText('No microphone device found');
        } else {
            console.log('Permission error:', error);
        }
        
        return false;
    }
}

// Start speech recognition
async function startRecognition() {
    if (isRecognizing) return;
    
    try {
        // Initialize WebSocket connection
        await initializeWebSocket();
        
        // Cancel recognition if WebSocket connection failed
        if (!socket || socket.readyState !== WebSocket.OPEN) {
            updateStatusText('Cannot connect to server, recognition canceled');
            updateIndicatorColor('#F44336'); // Red indicates error
            return;
        }
        
        // Check if recognition is initialized
        if (!recognition && !initializeSpeechRecognition()) {
            updateStatusText('Cannot initialize speech recognition');
            updateIndicatorColor('#F44336'); // Red indicates error
            return;
        }
        
        // Start recognition
        recognition.start();
        
    } catch (error) {
        console.error('Failed to start recognition:', error);
        updateStatusText('Recognition failed, please try again');
        updateIndicatorColor('#F44336'); // Red indicates error
    }
}

// Stop speech recognition
function stopRecognition() {
    if (!isRecognizing || !recognition) return;
    
    try {
        // Stop recognition
        recognition.stop();
        
    } catch (error) {
        console.error('Failed to stop recognition:', error);
        updateStatusText('Failed to stop recognition');
        updateIndicatorColor('#F44336'); // Red indicates error
    }
}

// Send recognized text to backend
async function sendTextToBackend(text) {
    try {
        console.log('Preparing to send text data...');
        
        // Check WebSocket connection
        if (!socket || socket.readyState !== WebSocket.OPEN) {
            console.error('WebSocket not connected, attempting to reconnect...');
            await initializeWebSocket();
            
            if (!socket || socket.readyState !== WebSocket.OPEN) {
                const resultDiv = document.getElementById('recognition-result');
                resultDiv.textContent = 'Error: WebSocket not connected, cannot send text data';
                return;
            }
        }
        
        // Send text data
        socket.send(JSON.stringify({
            type: 'text_data',
            text: text
        }));
        
        console.log('Text data sent:', text);
        
        // Display recognized text
        document.getElementById('recognition-result').textContent = `Sent: ${text}`;
        
    } catch (error) {
        console.error('Failed to send text data:', error);
        const resultDiv = document.getElementById('recognition-result');
        resultDiv.textContent = `Error: ${error.message}`;
    }
}

// Handle space key press
function handleSpaceKeyDown() {
    if (longPressTimer === null) {
        spaceKeyDown = true;
        longPressTimer = setTimeout(async () => {
            // Request microphone permission when long press exceeds threshold
            console.log('Space key held, requesting microphone permission');
            updateStatusText('Launching voice assistant...');
            
            const permissionGranted = await requestMicrophonePermission();
            if (permissionGranted) {
                // Start speech recognition
                await startRecognition();
            }
            
        }, LONG_PRESS_DURATION);
    }
}

// Handle space key release
function handleSpaceKeyUp() {
    if (spaceKeyDown) {
        spaceKeyDown = false;
        if (longPressTimer !== null) {
            clearTimeout(longPressTimer);
            longPressTimer = null;
            
            // Stop recognition if running
            if (isRecognizing) {
                stopRecognition();
            }
            // Restore standby status if permission not requested or recognition not started
            else if (!permissionRequested) {
                updateStatusText('Hold space key to start voice assistant');
                updateIndicatorColor('#f0ad4e'); // Yellow indicates standby
            }
        }
    }
}

// Add keyboard event listeners
document.addEventListener('keydown', (event) => {
    // Trigger only when space key is pressed and not in input field
    if (event.code === 'Space' && 
        !['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) {
        // Prevent default behavior (page scrolling etc.)
        event.preventDefault();
        handleSpaceKeyDown();
    }
});

document.addEventListener('keyup', (event) => {
    if (event.code === 'Space') {
        handleSpaceKeyUp();
    }
});

// Add recording control buttons (for testing)
function addRecordingControls() {
    const controlsDiv = document.createElement('div');
    controlsDiv.style.position = 'fixed';
    controlsDiv.style.top = '100px';
    controlsDiv.style.right = '20px';
    controlsDiv.style.zIndex = '10000';
    controlsDiv.style.display = 'flex';
    controlsDiv.style.flexDirection = 'column';
    controlsDiv.style.gap = '10px';
    
    const startButton = document.createElement('button');
    startButton.textContent = 'Start Recognition';
    startButton.style.padding = '8px 16px';
    startButton.style.borderRadius = '4px';
    startButton.style.cursor = 'pointer';
    startButton.onclick = async () => {
        const permissionGranted = await requestMicrophonePermission();
        if (permissionGranted) {
            await startRecognition();
        }
    };
    
    const stopButton = document.createElement('button');
    stopButton.textContent = 'Stop Recognition';
    stopButton.style.padding = '8px 16px';
    stopButton.style.borderRadius = '4px';
    stopButton.style.cursor = 'pointer';
    stopButton.onclick = () => {
        stopRecognition();
    };
    
    const testButton = document.createElement('button');
    testButton.textContent = 'Test Backend Connection';
    testButton.style.padding = '8px 16px';
    testButton.style.borderRadius = '4px';
    testButton.style.cursor = 'pointer';
    testButton.onclick = async () => {
        await testBackendConnection();
    };
    
    const testTextButton = document.createElement('button');
    testTextButton.textContent = 'Send Test Text';
    testTextButton.style.padding = '8px 16px';
    testTextButton.style.borderRadius = '4px';
    testTextButton.style.cursor = 'pointer';
    testTextButton.onclick = async () => {
        await sendTextToBackend("Test message from browser speech recognition");
    };
    
    const analyzePageButton = document.createElement('button');
    analyzePageButton.textContent = 'Analyze Page Content';
    analyzePageButton.style.padding = '8px 16px';
    analyzePageButton.style.borderRadius = '4px';
    analyzePageButton.style.backgroundColor = '#4CAF50';
    analyzePageButton.style.color = 'white';
    analyzePageButton.style.border = 'none';
    analyzePageButton.style.cursor = 'pointer';
    analyzePageButton.onclick = async () => {
        await analyzePageContent();
    };
    
    const genaiNavButton = document.createElement('button');
    genaiNavButton.textContent = 'Test GenAI Navigation';
    genaiNavButton.style.padding = '8px 16px';
    genaiNavButton.style.borderRadius = '4px';
    genaiNavButton.style.backgroundColor = '#2196F3';
    genaiNavButton.style.color = 'white';
    genaiNavButton.style.border = 'none';
    genaiNavButton.style.cursor = 'pointer';
    genaiNavButton.onclick = () => {
        const navButtons = identifyGenAIGenesisNavButtons();
        if (navButtons && navButtons.length > 0) {
            document.getElementById('recognition-result').innerHTML = `
                <div>GenAIGenesis Navigation Buttons:</div>
                <ul style="list-style-type:none; padding-left:0;">
                    ${navButtons.map((btn, i) => 
                        `<li style="margin:5px 0; cursor:pointer; padding:5px; background:rgba(255,255,255,0.1); border-radius:4px;" 
                             onclick="(function(){console.log('Clicking ${btn.label}'); 
                                      document.querySelector('#recognition-result').textContent='Clicked on ${btn.label}'; 
                                      setTimeout(() => document.querySelectorAll('${btn.element.tagName.toLowerCase()}').forEach(
                                          el => el.textContent.trim() === '${btn.label}' ? el.click() : null), 500)})()">
                            ${i+1}. ${btn.label}
                         </li>`
                    ).join('')}
                </ul>
            `;
        } else {
            document.getElementById('recognition-result').textContent = 'No GenAIGenesis navigation buttons found or not on GenAIGenesis site';
        }
    };
    
    controlsDiv.appendChild(startButton);
    controlsDiv.appendChild(stopButton);
    controlsDiv.appendChild(testButton);
    controlsDiv.appendChild(testTextButton);
    controlsDiv.appendChild(analyzePageButton);
    controlsDiv.appendChild(genaiNavButton);
    document.body.appendChild(controlsDiv);
}

// Test backend connection
async function testBackendConnection() {
    try {
        updateStatusText('Testing backend connection...');
        
        // Test regular HTTP connection
        fetch('http://localhost:8000/debug')
            .then(response => {
                if (!response.ok) {
                    throw new Error(`HTTP error: ${response.status}`);
                }
                return response.json();
            })
            .then(async data => {
                console.log('Backend connection test successful:', data);
                updateStatusText('Backend connection test successful');
                
                const resultDiv = document.getElementById('recognition-result');
                resultDiv.innerHTML = `
                    <div>Backend connection successful!</div>
                    <div>System information:</div>
                    <ul>
                        <li>Time: ${data.timestamp}</li>
                        <li>Python version: ${data.system_info.python_version.split(' ')[0]}</li>
                        <li>Whisper model: ${data.system_info.whisper_model}</li>
                        <li>CUDA available: ${data.system_info.cuda_available}</li>
                    </ul>
                    <div>Now trying WebSocket connection...</div>
                `;
                
                // Test WebSocket connection
                await initializeWebSocket();
            })
            .catch(error => {
                console.error('Backend connection test failed:', error);
                updateStatusText('Backend connection test failed');
                updateIndicatorColor('#F44336'); // Red indicates error
                
                const resultDiv = document.getElementById('recognition-result');
                resultDiv.innerHTML = `
                    <div>Error: Cannot connect to backend server</div>
                    <div>Please ensure:</div>
                    <ol>
                        <li>Backend server is running (python main.py)</li>
                        <li>Backend server uses HTTP instead of HTTPS (correctly configured as ws://)</li>
                        <li>Chrome extension has microphone access permission</li>
                    </ol>
                    <div>Error details: ${error.message}</div>
                `;
            });
    } catch (error) {
        console.error('Connection test failed:', error);
        updateStatusText('Connection test failed');
        updateIndicatorColor('#F44336'); // Red indicates error
    }
}

// Add recording control buttons when page loads
window.addEventListener('load', async () => {
    addRecordingControls();
    // Initialize WebSocket connection
    await initializeWebSocket();
    
    // If on GenAIGenesis website, identify navigation buttons
    if (window.location.href.includes('genaigenesis.ca')) {
        setTimeout(() => {
            const navButtons = identifyGenAIGenesisNavButtons();
            console.log('Navigation buttons identified:', navButtons ? navButtons.length : 0);
        }, 1000); // Slight delay to ensure page is fully loaded
    }
});

// Function to gather and send page content for analysis
async function analyzePageContent() {
    try {
        console.log('Gathering page content for analysis...');
        updateStatusText('Analyzing page content...');
        updateIndicatorColor('#f0ad4e'); // Yellow indicates processing
        
        // Add debug info to help diagnose issues
        console.log('Debug info:');
        console.log('- Window location:', window.location.href);
        console.log('- Document ready state:', document.readyState);
        console.log('- Document has body:', !!document.body);
        
        // Gather page content
        const html = document.documentElement.outerHTML;
        const text = document.body.innerText;
        const url = window.location.href;
        
        console.log(`Page analysis URL: ${url}`);
        console.log(`Page text length: ${text.length} characters`);
        console.log(`HTML length: ${html.length} characters`);
        console.log(`First 100 characters of HTML: ${html.substring(0, 100)}`);
        
        // Check HTML content
        if (!html || html.length < 100) {
            console.error('HTML content is too short or empty');
            document.getElementById('recognition-result').textContent = 'Error: HTML content is too short or empty';
            updateStatusText('Analysis failed');
            updateIndicatorColor('#F44336'); // Red indicates error
            return;
        }
        
        // Check WebSocket connection
        if (!socket || socket.readyState !== WebSocket.OPEN) {
            console.error('WebSocket not connected, attempting to reconnect...');
            await initializeWebSocket();
            
            if (!socket || socket.readyState !== WebSocket.OPEN) {
                const resultDiv = document.getElementById('recognition-result');
                resultDiv.textContent = 'Error: WebSocket not connected, cannot analyze page content';
                updateStatusText('Connection failed');
                updateIndicatorColor('#F44336'); // Red indicates error
                return;
            }
        }
        
        console.log('Sending page content to server for analysis...');
        console.log('WebSocket state:', socket.readyState);
        
        // Send page content for analysis - with chunking for very large pages
        const MAX_MESSAGE_SIZE = 5 * 1024 * 1024; // 5MB limit for WebSocket messages
        
        if (html.length > MAX_MESSAGE_SIZE) {
            console.log('HTML content is very large, sending truncated version');
            const truncatedHtml = html.substring(0, MAX_MESSAGE_SIZE);
            
            // Log the message size
            console.log(`Sending truncated message of size: ${JSON.stringify({
                type: 'page_content',
                html: '[truncated]',
                text: '[truncated]',
                url: url
            }).length} bytes`);
            
            try {
                socket.send(JSON.stringify({
                    type: 'page_content',
                    html: truncatedHtml,
                    text: text.substring(0, 10000), // Also limit text
                    url: url
                }));
                
                console.log('Truncated page content sent for analysis');
            } catch (e) {
                console.error('Error sending message:', e);
                document.getElementById('recognition-result').textContent = `Error sending message: ${e.message}`;
                updateStatusText('Send failed');
                updateIndicatorColor('#F44336'); // Red indicates error
                return;
            }
        } else {
            // Log the message size
            console.log(`Sending message of size: ${JSON.stringify({
                type: 'page_content',
                html: '[full html]',
                text: '[full text]',
                url: url
            }).length} bytes`);
            
            try {
                socket.send(JSON.stringify({
                    type: 'page_content',
                    html: html,
                    text: text,
                    url: url
                }));
                
                console.log('Page content sent for analysis');
            } catch (e) {
                console.error('Error sending message:', e);
                document.getElementById('recognition-result').textContent = `Error sending message: ${e.message}`;
                updateStatusText('Send failed');
                updateIndicatorColor('#F44336'); // Red indicates error
                return;
            }
        }
        
        document.getElementById('recognition-result').textContent = 'Analyzing page content...';
        
    } catch (error) {
        console.error('Failed to analyze page content:', error);
        updateStatusText('Analysis failed');
        updateIndicatorColor('#F44336'); // Red indicates error
        
        const resultDiv = document.getElementById('recognition-result');
        resultDiv.textContent = `Error: ${error.message}`;
    }
}

// Function to execute actions on the page
function executeAction(actionType, targetSelector, value = '', elementType = 'unknown', elementAttributes = {}) {
    try {
        console.log(`Executing action: ${actionType} on ${targetSelector} with value:`, value);
        console.log(`Element type: ${elementType}, attributes:`, elementAttributes);
        
        // Special handling for analyze_page which doesn't need a target element
        if (actionType.toLowerCase() === 'analyze_page') {
            console.log('Direct analyze_page command received');
            analyzePageContent();
            return true;
        }
        
        // First try with the selector if it looks like a valid CSS selector
        let elements = [];
        if (targetSelector.includes('#') || targetSelector.includes('.') || targetSelector.includes('[') || 
            targetSelector.includes('button') || targetSelector.includes('input')) {
            try {
                elements = document.querySelectorAll(targetSelector);
            } catch (e) {
                console.log('Invalid CSS selector, will try text search instead:', e);
                elements = [];
            }
        }
        
        // If no elements found by selector, try finding by text and type
        if (elements.length === 0) {
            elements = findElementsByText(targetSelector, elementType, elementAttributes);
        }
        
        if (elements.length === 0) {
            console.error(`No elements found matching target: ${targetSelector}`);
            document.getElementById('recognition-result').textContent = `Could not find any element matching "${targetSelector}"`;
            return false;
        }
        
        // Use the first matching element by default
        executeActionOnElement(elements[0], actionType, value, elementAttributes);
        return true;
        
    } catch (error) {
        console.error('Failed to execute action:', error);
        document.getElementById('recognition-result').textContent = `Error executing action: ${error.message}`;
        return false;
    }
}

// Find elements by text
function findElementsByText(text, elementType = 'unknown', attributes = {}) {
    console.log(`Finding elements with text: "${text}", type: ${elementType}, attributes:`, attributes);
    
    // Check if we have specific ID or class
    if (attributes.id) {
        const elementById = document.getElementById(attributes.id);
        if (elementById) {
            return [elementById];
        }
    }
    
    // GenAIGenesis special case - for navigation buttons and sign out
    if (window.location.href.includes('genaigenesis.ca')) {
        const genaiButtonMap = {
            'home': 'Home',
            'about': 'About',
            'sponsors': 'Sponsors', 
            'faq': 'FAQ',
            'team': 'Team',
            'dashboard': 'Dashboard',
            'sign out': 'Sign out',
            'signout': 'Sign out',
            'sign-out': 'Sign out',
            'logout': 'Sign out',
            'log out': 'Sign out',
            // Chinese translations
            '首页': 'Home',
            '主页': 'Home',
            '关于': 'About',
            '赞助商': 'Sponsors',
            '常见问题': 'FAQ',
            '问答': 'FAQ',
            '团队': 'Team',
            '仪表盘': 'Dashboard',
            '控制面板': 'Dashboard',
            '退出': 'Sign out',
            '登出': 'Sign out',
            '注销': 'Sign out'
        };
        
        // Normalize text to lowercase
        const normalizedText = text.toLowerCase().trim();
        
        // Check if this is a navigation button
        if (genaiButtonMap[normalizedText]) {
            const buttonText = genaiButtonMap[normalizedText];
            console.log(`GenAIGenesis navigation button: "${normalizedText}" -> "${buttonText}"`);
            
            // First try exact match
            const navExactElements = Array.from(document.querySelectorAll('a, button')).filter(el => 
                el.textContent && el.textContent.trim() === buttonText
            );
            
            if (navExactElements.length > 0) {
                console.log(`Found ${navExactElements.length} exact navigation matches for "${buttonText}"`);
                return navExactElements;
            }
            
            // Try case insensitive match
            const navInsensitiveElements = Array.from(document.querySelectorAll('a, button')).filter(el => 
                el.textContent && el.textContent.trim().toLowerCase() === buttonText.toLowerCase()
            );
            
            if (navInsensitiveElements.length > 0) {
                console.log(`Found ${navInsensitiveElements.length} case-insensitive navigation matches for "${buttonText}"`);
                return navInsensitiveElements;
            }
            
            // Try contains match
            const navContainsElements = Array.from(document.querySelectorAll('a, button')).filter(el => 
                el.textContent && el.textContent.toLowerCase().includes(buttonText.toLowerCase())
            );
            
            if (navContainsElements.length > 0) {
                console.log(`Found ${navContainsElements.length} partial navigation matches for "${buttonText}"`);
                return navContainsElements;
            }
            
            // If still not found, try menu items or other navigation elements
            const menuItems = Array.from(document.querySelectorAll('li, div.nav-item, div.menu-item')).filter(el => 
                el.textContent && el.textContent.toLowerCase().includes(buttonText.toLowerCase())
            );
            
            if (menuItems.length > 0) {
                console.log(`Found ${menuItems.length} menu items for "${buttonText}"`);
                return menuItems;
            }
            
            console.log(`Could not find any elements for GenAIGenesis navigation button: "${buttonText}"`);
        }
    }
    
    // Normal element finding logic for non-GenAIGenesis sites
    text = text.toLowerCase();
    const result = [];
    
    // Build selector based on element type
    let selector = '';
    if (elementType === 'button') {
        selector = 'button, input[type="button"], input[type="submit"], input[type="reset"], [role="button"]';
    } else if (elementType === 'link') {
        selector = 'a, [role="link"]';
    } else if (elementType === 'input') {
        selector = 'input:not([type="button"]):not([type="submit"]):not([type="reset"]), textarea, [role="textbox"]';
    } else if (elementType === 'checkbox') {
        selector = 'input[type="checkbox"], [role="checkbox"]';
    } else if (elementType === 'radio') {
        selector = 'input[type="radio"], [role="radio"]';
    } else if (elementType === 'select' || elementType === 'dropdown') {
        selector = 'select, [role="combobox"], [role="listbox"]';
    } else {
        // Generic selector for all interactive elements
        selector = 'a, button, input, textarea, select, [role="button"], [type="button"], [type="submit"], [role="link"], [role="checkbox"], [role="radio"]';
    }
    
    // Find elements with matching text content
    document.querySelectorAll(selector).forEach(element => {
        let elementText = '';
        
        // Get text content based on element type
        if (element.tagName === 'INPUT' && element.type !== 'button' && element.type !== 'submit') {
            elementText = element.placeholder || element.name || element.id || '';
        } else {
            elementText = element.textContent || element.innerText || element.ariaLabel || element.title || '';
        }
        
        // Check label if it's a form field
        if (element.id && (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA' || element.tagName === 'SELECT')) {
            const labels = document.querySelectorAll(`label[for="${element.id}"]`);
            if (labels.length > 0) {
                elementText += ' ' + (labels[0].textContent || labels[0].innerText || '');
            }
        }
        
        elementText = elementText.toLowerCase().trim();
        
        // Check if element text contains the search text
        if (elementText.includes(text)) {
            result.push(element);
        }
        
        // Check element attributes
        if (attributes && Object.keys(attributes).length > 0) {
            let matchesAttributes = true;
            
            for (const [key, value] of Object.entries(attributes)) {
                if (key === 'text') continue; // Already checked text content
                if (element.getAttribute(key) !== value.toString()) {
                    matchesAttributes = false;
                    break;
                }
            }
            
            if (matchesAttributes && !result.includes(element)) {
                result.push(element);
            }
        }
    });
    
    console.log(`Found ${result.length} elements matching "${text}"`);
    return result;
}

// Execute the specific action on the element
function executeActionOnElement(element, actionType, value, elementAttributes = {}) {
    switch (actionType.toLowerCase()) {
        case 'click':
            console.log('Clicking element:', element);
            // Ensure element is in view
            element.scrollIntoView({behavior: 'smooth', block: 'center'});
            
            // Add a brief highlight effect
            const originalBackground = element.style.backgroundColor;
            const originalTransition = element.style.transition;
            element.style.transition = 'background-color 0.3s';
            element.style.backgroundColor = '#ffcc00';
            
            // Click after a small delay
            setTimeout(() => {
                element.click();
                document.getElementById('recognition-result').textContent = `Clicked on "${element.textContent || element.value || element.id || 'element'}"`;
                
                // Restore original background
                setTimeout(() => {
                    element.style.backgroundColor = originalBackground;
                    element.style.transition = originalTransition;
                }, 500);
            }, 300);
            break;
            
        case 'input':
        case 'type':
        case 'fill':
            console.log('Inputting text into element:', element, 'Value:', value);
            if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
                // Extract placeholder text if value is an object
                let inputValue = value;
                if (typeof value === 'object' && value.placeholder) {
                    inputValue = value.placeholder;
                }
                
                // Ensure element is in view
                element.scrollIntoView({behavior: 'smooth', block: 'center'});
                
                // Add a highlight effect
                const originalBorder = element.style.border;
                const originalBoxShadow = element.style.boxShadow;
                element.style.border = '2px solid #4CAF50';
                element.style.boxShadow = '0 0 5px #4CAF50';
                
                // Focus and input text after a small delay
                setTimeout(() => {
                    // Focus the element
                    element.focus();
                    
                    // Clear existing value
                    element.value = '';
                    
                    // Dispatch input event to ensure event listeners are triggered
                    let event = new Event('input', { bubbles: true });
                    element.dispatchEvent(event);
                    
                    // Set the new value
                    element.value = inputValue;
                    
                    // Dispatch change event
                    event = new Event('change', { bubbles: true });
                    element.dispatchEvent(event);
                    
                    document.getElementById('recognition-result').textContent = `Entered "${inputValue}" into ${element.placeholder || element.name || element.id || 'input field'}`;
                    
                    // Restore original style
                    setTimeout(() => {
                        element.style.border = originalBorder;
                        element.style.boxShadow = originalBoxShadow;
                    }, 1000);
                }, 300);
            } else {
                console.error('Target element is not an input field:', element);
                document.getElementById('recognition-result').textContent = 'Target element is not an input field';
            }
            break;
            
        case 'scroll':
            console.log('Scrolling page');
            const scrollAmount = value && value.amount ? value.amount : 500;
            const direction = value && value.direction === 'up' ? -1 : 1;
            window.scrollBy({
                top: scrollAmount * direction,
                behavior: 'smooth'
            });
            document.getElementById('recognition-result').textContent = `Scrolled ${direction > 0 ? 'down' : 'up'} the page`;
            break;
            
        case 'navigate':
            if (value && value.action === 'back') {
                console.log('Navigating back');
                window.history.back();
                document.getElementById('recognition-result').textContent = 'Navigated back to previous page';
            } else if (value && value.action === 'forward') {
                console.log('Navigating forward');
                window.history.forward();
                document.getElementById('recognition-result').textContent = 'Navigated forward';
            } else if (value && value.url) {
                console.log('Navigating to URL:', value.url);
                window.location.href = value.url;
                document.getElementById('recognition-result').textContent = `Navigating to ${value.url}`;
            }
            break;

        case 'analyze_page':
            console.log('Analyzing page content');
            analyzePageContent();
            break;
            
        default:
            console.error('Unknown action type:', actionType);
            document.getElementById('recognition-result').textContent = `Unknown action type: ${actionType}`;
    }
}

// Display page analysis results
function displayPageAnalysisResults(data) {
    const resultDiv = document.getElementById('recognition-result');
    
    let resultsHTML = `
        <div class="analysis-results">
            <div class="main-content">
                <strong>Page Content:</strong> ${data.main_content}
            </div>
    `;
    
    // Check if we're on GenAIGenesis site
    const isGenAIGenesisSite = window.location.href.includes('genaigenesis.ca');
    
    if ((data.actions && data.actions.length > 0) || isGenAIGenesisSite) {
        resultsHTML += `<div class="possible-actions"><strong>Interactive Elements:</strong></div><ul>`;
        
        // Count how many elements of each type
        let buttonCount = 0;
        let inputCount = 0;
        
        // Display received actions first
        if (data.actions && data.actions.length > 0) {
            data.actions.forEach((action, index) => {
                // Store action attributes as JSON strings
                const actionParams = action.parameters ? JSON.stringify(action.parameters) : '{}';
                const elementAttrs = action.element_attributes ? JSON.stringify(action.element_attributes) : '{}';
                
                // Count element types
                if (action.action_type === 'input' || 
                    (action.element_type && ['input', 'textarea'].includes(action.element_type.toLowerCase()))) {
                    inputCount++;
                } else if (action.action_type === 'click' && 
                           action.element_type && ['button', 'checkbox', 'radio'].includes(action.element_type.toLowerCase())) {
                    buttonCount++;
                }
                
                // Add icon based on element type
                let iconHtml = '';
                if (action.action_type === 'input') {
                    iconHtml = '<span class="action-icon input-icon">📝</span>';
                } else if (action.element_type === 'button') {
                    iconHtml = '<span class="action-icon button-icon">🔘</span>';
                } else if (action.element_type === 'checkbox') {
                    iconHtml = '<span class="action-icon checkbox-icon">☑️</span>';
                } else if (action.element_type === 'radio') {
                    iconHtml = '<span class="action-icon radio-icon">⚪</span>';
                }
                
                // Add CSS class based on element type
                let elementClass = 'action-item';
                if (action.action_type === 'input') {
                    elementClass += ' input-action';
                } else if (action.element_type === 'button') {
                    elementClass += ' button-action';
                }
                
                resultsHTML += `
                    <li class="${elementClass}" 
                        data-index="${index}" 
                        data-action-type="${action.action_type}" 
                        data-target="${action.target_element || ''}" 
                        data-value='${actionParams}'
                        data-element-type="${action.element_type || 'unknown'}"
                        data-element-attrs='${elementAttrs}'>
                        ${iconHtml} ${action.description}
                    </li>
                `;
            });
        }
        // If on GenAIGenesis site and no actions found, manually add navigation buttons
        else if (isGenAIGenesisSite) {
            console.log("No actions received from backend, adding navigation buttons manually");
            
            // Default GenAIGenesis navigation buttons
            const navButtons = ["Home", "About", "Sponsors", "FAQ", "Team", "Dashboard", "Sign out"];
            
            navButtons.forEach((btn, index) => {
                const elementAttrs = JSON.stringify({"text": btn});
                buttonCount++;
                
                resultsHTML += `
                    <li class="action-item button-action" 
                        data-index="${index}" 
                        data-action-type="click" 
                        data-target="a:contains('${btn}'), button:contains('${btn}')" 
                        data-value='{}'
                        data-element-type="button"
                        data-element-attrs='${elementAttrs}'>
                        <span class="action-icon button-icon">🔘</span> Click '${btn}' button
                    </li>
                `;
            });
        }
        
        resultsHTML += `</ul>`;
        
        // Add summary of found elements
        resultsHTML += `<div class="elements-summary">
            Found ${buttonCount} buttons and ${inputCount} input fields
        </div>`;
    } else {
        resultsHTML += `<div>No interactive elements identified for this page.</div>`;
    }
    
    resultsHTML += `</div>`;
    
    resultDiv.innerHTML = resultsHTML;
    
    // Add styles for the new elements
    if (!document.getElementById('analysis-results-style')) {
        const style = document.createElement('style');
        style.id = 'analysis-results-style';
        style.textContent = `
            .analysis-results ul {
                padding-left: 5px;
                list-style-type: none;
            }
            .action-item {
                padding: 5px 0;
                cursor: pointer;
                transition: background-color 0.2s;
                border-radius: 4px;
                margin: 4px 0;
            }
            .action-item:hover {
                background-color: rgba(255, 255, 255, 0.1);
            }
            .action-icon {
                margin-right: 5px;
            }
            .input-action {
                color: #81D4FA;
            }
            .button-action {
                color: #FFCC80;
            }
            .elements-summary {
                margin-top: 10px;
                font-size: 12px;
                color: #BBB;
            }
        `;
        document.head.appendChild(style);
    }
    
    // Add click event listeners to action items
    const actionItems = document.querySelectorAll('.action-item');
    actionItems.forEach(item => {
        item.addEventListener('click', () => {
            const index = parseInt(item.getAttribute('data-index'));
            const actionType = item.getAttribute('data-action-type');
            const target = item.getAttribute('data-target');
            const elementType = item.getAttribute('data-element-type');
            
            // Parse the JSON values
            let value = {};
            let elementAttributes = {};
            
            try {
                const valueStr = item.getAttribute('data-value');
                if (valueStr) {
                    value = JSON.parse(valueStr);
                }
                
                const attrsStr = item.getAttribute('data-element-attrs');
                if (attrsStr) {
                    elementAttributes = JSON.parse(attrsStr);
                }
            } catch (e) {
                console.error('Error parsing action attributes:', e);
            }
            
            console.log(`Action clicked: ${actionType} on ${target} with type ${elementType}`);
            console.log('Value:', value);
            console.log('Element attributes:', elementAttributes);
            
            executeAction(actionType, target, value, elementType, elementAttributes);
        });
    });
}

// Function to identify all GenAIGenesis navigation buttons on the page
function identifyGenAIGenesisNavButtons() {
    if (!window.location.href.includes('genaigenesis.ca')) {
        console.log('Not on GenAIGenesis website, skipping nav button identification');
        return;
    }
    
    console.log('Scanning for GenAIGenesis navigation buttons...');
    
    const navButtonLabels = ["Home", "About", "Sponsors", "FAQ", "Team", "Dashboard", "Sign out", "Sign Out", "Logout", "Log out"];
    const foundButtons = [];
    
    // First look for elements with exact text matches
    navButtonLabels.forEach(label => {
        const elements = Array.from(document.querySelectorAll('a, button')).filter(el => 
            el.textContent && el.textContent.trim() === label
        );
        
        if (elements.length > 0) {
            console.log(`Found ${elements.length} exact matches for "${label}"`);
            elements.forEach((el, index) => {
                const tagName = el.tagName.toLowerCase();
                const id = el.id ? `id="${el.id}"` : '';
                const classes = el.className ? `class="${el.className}"` : '';
                const href = el.href ? `href="${el.href}"` : '';
                console.log(`  ${index + 1}. <${tagName} ${id} ${classes} ${href}>${el.textContent}</${tagName}>`);
                foundButtons.push({label, element: el});
            });
        }
    });
    
    // Then look for partial matches if we didn't find all buttons
    if (foundButtons.length < navButtonLabels.length) {
        console.log('Looking for partial text matches...');
        navButtonLabels.forEach(label => {
            // Skip if we already found an exact match
            if (foundButtons.some(btn => btn.label === label)) {
                return;
            }
            
            const elements = Array.from(document.querySelectorAll('a, button')).filter(el => 
                el.textContent && el.textContent.toLowerCase().includes(label.toLowerCase())
            );
            
            if (elements.length > 0) {
                console.log(`Found ${elements.length} partial matches for "${label}"`);
                elements.forEach((el, index) => {
                    const tagName = el.tagName.toLowerCase();
                    const id = el.id ? `id="${el.id}"` : '';
                    const classes = el.className ? `class="${el.className}"` : '';
                    const href = el.href ? `href="${el.href}"` : '';
                    console.log(`  ${index + 1}. <${tagName} ${id} ${classes} ${href}>${el.textContent}</${tagName}>`);
                    foundButtons.push({label, element: el});
                });
            }
        });
    }
    
    console.log(`Total GenAIGenesis navigation buttons found: ${foundButtons.length}`);
    return foundButtons;
}
