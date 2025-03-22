// 创建 overlay
let voiceOverlay = document.createElement('div');
voiceOverlay.id = 'voice-control-overlay';
voiceOverlay.innerHTML = `
      <div class="voice-status">
          <div class="voice-indicator"></div>
          <span class="status-text">Hold space key to start talk</span>
      </div>
      <div id="recognition-result" class="recognition-result"></div>
  `;
document.body.appendChild(voiceOverlay);

// 添加样式
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

// Recording related variables
let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;
let recordingInterval = null;
let socket = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;

// Request microphone permission function
async function requestMicrophonePermission() {
    if (permissionRequested) return;
    
    try {
        // Update UI status
        updateStatusText('Requesting microphone permission...');
        updateIndicatorColor('#f0ad4e'); // Yellow indicates processing
        
        // Use constraints with noise suppression and echo cancellation
        const constraints = {
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
            },
            video: false
        };
        
        // Try to request microphone permission
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        permissionRequested = true;

        // If permission is granted, update overlay status
        console.log('Microphone permission granted');
        updateStatusText('Microphone permission granted, starting recording...');
        updateIndicatorColor('#4CAF50'); // Green indicates success

        // Notify background.js that permission is granted
        chrome.runtime.sendMessage({ type: 'PERMISSION_GRANTED' });
        
        // Return stream to start recording
        return stream;
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
        
        return null;
    }
}

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
            
            if (!isRecording) {
                updateStatusText('Connected, hold space key to start talk');
            } else {
                updateStatusText('Recording...');
            }
        };
        
        socket.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                console.log('Received WebSocket message:', data);
                
                if (data.command) {
                    displayRecognitionResult({ command: data.command });
                } else if (data.error) {
                    console.error('WebSocket error:', data.error);
                    displayRecognitionResult({ error: data.message || data.error });
                }
            } catch (error) {
                console.error('Failed to parse WebSocket message:', error);
            }
        };
        
        socket.onclose = (event) => {
            console.log(`WebSocket connection closed: code=${event.code} reason=${event.reason}`);
            
            if (!isRecording) {
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

// Start recording
async function startRecording(stream) {
    if (isRecording) return;
    
    try {
        // Initialize WebSocket connection
        await initializeWebSocket();
        
        // Cancel recording if WebSocket connection failed
        if (!socket || socket.readyState !== WebSocket.OPEN) {
            updateStatusText('Cannot connect to server, recording canceled');
            updateIndicatorColor('#F44336'); // Red indicates error
            return;
        }
        
        audioChunks = [];
        isRecording = true;
        
        // Create MediaRecorder instance
        mediaRecorder = new MediaRecorder(stream, {
            mimeType: 'audio/webm',
        });
        
        // Set handler for when data is available
        mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                audioChunks.push(event.data);
            }
        };
        
        // Set handler for when recording stops
        mediaRecorder.onstop = () => {
            if (audioChunks.length > 0) {
                const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
                sendAudioToBackend(audioBlob);
                audioChunks = [];
            }
        };
        
        // Start recording
        mediaRecorder.start();
        
        // Stop and restart recording periodically to send data
        recordingInterval = setInterval(() => {
            if (mediaRecorder && mediaRecorder.state === 'recording') {
                mediaRecorder.stop();
                mediaRecorder.start();
            }
        }, 2000); // Send data every 2 seconds
        
        updateStatusText('Recording...');
        updateIndicatorColor('#4CAF50'); // Green indicates recording
        console.log('Recording started');
    } catch (error) {
        console.error('Failed to start recording:', error);
        updateStatusText('Recording failed, please try again');
        updateIndicatorColor('#F44336'); // Red indicates error
        isRecording = false;
    }
}

// Stop recording
function stopRecording() {
    if (!isRecording || !mediaRecorder) return;
    
    try {
        // Clear timer
        if (recordingInterval) {
            clearInterval(recordingInterval);
            recordingInterval = null;
        }
        
        // Stop recording
        if (mediaRecorder.state === 'recording') {
            mediaRecorder.stop();
        }
        
        isRecording = false;
        updateStatusText('Recording stopped');
        updateIndicatorColor('#f0ad4e'); // Yellow indicates standby
        console.log('Recording stopped');
    } catch (error) {
        console.error('Failed to stop recording:', error);
        updateStatusText('Failed to stop recording');
        updateIndicatorColor('#F44336'); // Red indicates error
    }
}

// Send audio to backend
async function sendAudioToBackend(audioBlob) {
    try {
        console.log('Preparing to send audio data...');
        
        // Check WebSocket connection
        if (!socket || socket.readyState !== WebSocket.OPEN) {
            console.error('WebSocket not connected, attempting to reconnect...');
            await initializeWebSocket();
            
            if (!socket || socket.readyState !== WebSocket.OPEN) {
                const resultDiv = document.getElementById('recognition-result');
                resultDiv.textContent = 'Error: WebSocket not connected, cannot send audio data';
                return;
            }
        }
        
        // Convert Blob to Base64
        const reader = new FileReader();
        reader.onloadend = () => {
            const base64data = reader.result.split(',')[1];
            
            // Send audio data
            socket.send(JSON.stringify({
                type: 'audio_data',
                data: base64data
            }));
            
            console.log('Audio data sent');
        };
        
        reader.readAsDataURL(audioBlob);
    } catch (error) {
        console.error('Failed to prepare audio data:', error);
        const resultDiv = document.getElementById('recognition-result');
        resultDiv.textContent = `Error: ${error.message}`;
    }
}

// Display recognition results
function displayRecognitionResult(data) {
    const resultDiv = document.getElementById('recognition-result');
    
    if (data.command) {
        if (data.command.type === 'GENERAL_COMMAND') {
            resultDiv.textContent = `Recognition result: ${data.command.text}`;
        } else if (data.command.type === 'URL_COMMAND') {
            resultDiv.textContent = `Recognition result: Open website ${data.command.url}`;
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

// Handle space key press
function handleSpaceKeyDown() {
    if (longPressTimer === null) {
        spaceKeyDown = true;
        longPressTimer = setTimeout(async () => {
            // Request microphone permission when long press exceeds threshold
            console.log('Space key held, requesting microphone permission');
            updateStatusText('Launching voice assistant...');
            
            const stream = await requestMicrophonePermission();
            if (stream) {
                // Start recording
                await startRecording(stream);
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
            
            // Stop recording if recording is in progress
            if (isRecording) {
                stopRecording();
            }
            // Restore standby status if permission not requested or recording not started
            else if (!permissionRequested) {
                updateStatusText('Hold space key to start talk');
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

// // Add recording control buttons (for testing)
// function addRecordingControls() {
//     const controlsDiv = document.createElement('div');
//     controlsDiv.style.position = 'fixed';
//     controlsDiv.style.top = '100px';
//     controlsDiv.style.right = '20px';
//     controlsDiv.style.zIndex = '10000';
//     controlsDiv.style.display = 'flex';
//     controlsDiv.style.flexDirection = 'column';
//     controlsDiv.style.gap = '10px';
    
//     const startButton = document.createElement('button');
//     startButton.textContent = 'Start Recording';
//     startButton.style.padding = '8px 16px';
//     startButton.style.borderRadius = '4px';
//     startButton.style.cursor = 'pointer';
//     startButton.onclick = async () => {
//         const stream = await requestMicrophonePermission();
//         if (stream) {
//             await startRecording(stream);
//         }
//     };
    
//     const stopButton = document.createElement('button');
//     stopButton.textContent = 'Stop Recording';
//     stopButton.style.padding = '8px 16px';
//     stopButton.style.borderRadius = '4px';
//     stopButton.style.cursor = 'pointer';
//     stopButton.onclick = () => {
//         stopRecording();
//     };
    
//     const testButton = document.createElement('button');
//     testButton.textContent = 'Test Backend Connection';
//     testButton.style.padding = '8px 16px';
//     testButton.style.borderRadius = '4px';
//     testButton.style.cursor = 'pointer';
//     testButton.onclick = async () => {
//         await testBackendConnection();
//     };
    
//     controlsDiv.appendChild(startButton);
//     controlsDiv.appendChild(stopButton);
//     controlsDiv.appendChild(testButton);
//     document.body.appendChild(controlsDiv);
// }

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
    // addRecordingControls();
    // Initialize WebSocket connection
    await initializeWebSocket();
});
