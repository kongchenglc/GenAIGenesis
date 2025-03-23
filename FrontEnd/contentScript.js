/**
 * Voice Assistant for Visually Impaired - Content Script
 * 
 * Main content script that runs on web pages. Handles voice
 * recognition, command processing, and accessibility features.
 */

class VoiceAssistant {
    constructor() {
        // Configuration
        this.config = {
            wakePhrases: ["hey assistant", "hello assistant"],
            stopPhrases: ["goodbye assistant", "bye assistant"],
            recordingTimeout: 10000, // 10 seconds max recording
            // audioFeedbackEnabled: true,
            spaceKeyEnabled: true, // Enable space key control
            longPressThreshold: 500, // Long press threshold in milliseconds
            showSpaceKeyHint: true, // Show space key hint
            autoAnalyzePages: true // Automatically analyze new pages
        };

        // State management
        this.state = {
            isActivated: false,
            isRecording: false,
            mediaRecorder: null,
            audioChunks: [],
            spaceKeyDown: false,
            longPressTimer: null,
            currentNavigationOptions: {}, // Store current navigation options
            inConversationMode: false, // Track if in conversation mode
            currentUrl: window.location.href, // Track current URL
            pageAnalyzed: false // Track if current page has been analyzed
        };

        // Initialize UI elements
        this.ui = {
            assistantContainer: null,
            activationIndicator: null,
            feedbackText: null,
            spaceKeyHint: null,
            dialogContainer: null, // For showing conversation options
            optionsContainer: null, // For showing navigation options
        };

        // Add WebSocket state
        this.websocket = {
            connection: null,
            isConnected: false,
            reconnectAttempts: 0,
            maxReconnectAttempts: 5,
            reconnectInterval: 3000, // 3 seconds
            url: 'ws://127.0.0.1:8000/ws' // Use actual server address
        };

        // Bindings
        this.startRecording = this.startRecording.bind(this);
        this.stopRecording = this.stopRecording.bind(this);
        this.processAudioData = this.processAudioData.bind(this);
        this.handleCommand = this.handleCommand.bind(this);
        this.executeDomAction = this.executeDomAction.bind(this);
        this.analyzePage = this.analyzePage.bind(this);
        this.speak = this.speak.bind(this);
        this.handleKeyDown = this.handleKeyDown.bind(this);
        this.handleKeyUp = this.handleKeyUp.bind(this);
        this.handleWebSocketMessage = this.handleWebSocketMessage.bind(this);
        this.processUserCommand = this.processUserCommand.bind(this);
        this.analyzeCurrentURL = this.analyzeCurrentURL.bind(this);
        this.connectWebSocket = this.connectWebSocket.bind(this);
        this.sendUrlToWebSocket = this.sendUrlToWebSocket.bind(this);
        this.closeWebSocket = this.closeWebSocket.bind(this);
    }

    /**
     * Initialize the assistant
     */
    async init() {
        try {
            // Create UI
            this.createUI();

            // Connect WebSocket
            this.connectWebSocket();

            // Set up listeners
            this.setupEventListeners();

            // Display ready message
            this.updateFeedbackText("Assistant ready. Hold space key or say 'Hey Assistant' to start.");

            // Show space key hint if enabled
            if (this.config.showSpaceKeyHint) {
                this.showSpaceKeyHint();
            }

            // Automatically analyze page if enabled
            if (this.config.autoAnalyzePages) {
                // Small delay to ensure everything is loaded
                setTimeout(() => {
                    this.analyzeCurrentURL();
                }, 1000);
            }

            // Notify background script that content script is ready
            chrome.runtime.sendMessage({ type: "CONTENT_SCRIPT_READY" })
                .catch(error => console.warn("Could not notify background script:", error));

            // Establish a connection with the background script
            const port = chrome.runtime.connect({ name: "content-script-connection" });

            port.onMessage.addListener((message) => {
                // Handle messages from background script
                console.log("Received message from background:", message);

                if (message.type === "WEBSOCKET_MESSAGE") {
                    this.handleWebSocketMessage(message.data);
                }
                // Other message types...
            });

        } catch (error) {
            console.error("Error initializing voice assistant:", error);
        }
    }

    /**
     * Create the UI elements for the assistant
     */
    createUI() {
        // Create container for the assistant UI
        const container = document.createElement('div');
        container.id = 'voice-assistant-container';
        container.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        width: 60px;
        height: 60px;
        border-radius: 30px;
        background-color: #3a3a3a;
        display: flex;
        justify-content: center;
        align-items: center;
        box-shadow: 0 2px 10px rgba(0, 0, 0, 0.2);
        z-index: 10000;
        transition: all 0.3s ease;
      `;

        // Create activation indicator
        const indicator = document.createElement('div');
        indicator.id = 'voice-assistant-indicator';
        indicator.style.cssText = `
        width: 40px;
        height: 40px;
        border-radius: 20px;
        background-color: #4CAF50;
        transition: all 0.3s ease;
      `;
        container.appendChild(indicator);

        // Create feedback text display
        const feedback = document.createElement('div');
        feedback.id = 'voice-assistant-feedback';
        feedback.style.cssText = `
        position: fixed;
        bottom: 90px;
        right: 20px;
        max-width: 300px;
        padding: 10px;
        background-color: rgba(0, 0, 0, 0.7);
        color: white;
        border-radius: 5px;
        font-family: Arial, sans-serif;
        font-size: 14px;
        z-index: 10000;
        display: none;
      `;

        // Create space key hint
        const spaceKeyHint = document.createElement('div');
        spaceKeyHint.className = 'space-key-hint';
        spaceKeyHint.style.display = 'none';

        // Add elements to the page
        document.body.appendChild(container);
        document.body.appendChild(feedback);
        document.body.appendChild(spaceKeyHint);

        // Store UI elements
        this.ui.assistantContainer = container;
        this.ui.activationIndicator = indicator;
        this.ui.feedbackText = feedback;
        this.ui.spaceKeyHint = spaceKeyHint;

        // 不再创建或存储dialogContainer和optionsContainer
        this.ui.dialogContainer = null;
        this.ui.optionsContainer = null;
    }

    /**
     * Show space key hint temporarily
     */
    showSpaceKeyHint() {
        if (!this.ui.spaceKeyHint) return;

        // Show the hint
        this.ui.spaceKeyHint.style.display = 'block';

        // Hide after 5 seconds
        setTimeout(() => {
            this.ui.spaceKeyHint.style.display = 'none';
        }, 5000);
    }

    /**
     * Set up event listeners
     */
    setupEventListeners() {
        // Listen for clicks on the assistant button
        this.ui.assistantContainer.addEventListener('click', () => {
            if (this.state.isActivated) {
                this.deactivate();
            } else {
                this.activate();
            }
        });

        // Add space key long press listener
        if (this.config.spaceKeyEnabled) {
            document.addEventListener('keydown', this.handleKeyDown);
            document.addEventListener('keyup', this.handleKeyUp);
        }

        // Listen for messages from background script
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            if (message.type === "WEBSOCKET_MESSAGE") {
                this.handleWebSocketMessage(message.data);
            }
            if (message.type === "CONTENT_SCRIPT_READY" && sender.tab) {
                this.state.currentUrl = window.location.href;
                this.state.pageAnalyzed = false;
                this.analyzeCurrentURL();
                sendResponse({ success: true });
            }
            return true;
        });

        // Listen for URL changes
        window.addEventListener('popstate', () => {
            // Check if the URL has changed
            if (this.state.currentUrl !== window.location.href) {
                this.state.currentUrl = window.location.href;
                this.state.pageAnalyzed = false;

                // Use WebSocket to send new URL
                if (this.config.autoAnalyzePages) {
                    setTimeout(() => {
                        this.sendUrlToWebSocket(window.location.href);
                        this.state.pageAnalyzed = true;
                    }, 1000);
                }
            }
        });

        // Load user preferences
        chrome.storage.sync.get(['autoAnalyzePages'], (result) => {
            if (result.hasOwnProperty('autoAnalyzePages')) {
                this.config.autoAnalyzePages = result.autoAnalyzePages;
            }
        });

        // Listen for custom locationchange event (SPA support)
        window.addEventListener('locationchange', (event) => {
            const newUrl = event.detail;
            if (this.state.currentUrl !== newUrl) {
                this.state.currentUrl = newUrl;
                this.state.pageAnalyzed = false;

                // Use WebSocket to send new URL
                if (this.config.autoAnalyzePages) {
                    setTimeout(() => {
                        this.sendUrlToWebSocket(newUrl);
                        this.state.pageAnalyzed = true;
                    }, 1000);
                }
            }
        });

        // Close WebSocket connection when page unloads
        window.addEventListener('beforeunload', () => {
            this.closeWebSocket();
        });

        // Track tab closure to clean up
        chrome.tabs.onRemoved.addListener((tabId) => {
            this.state.currentUrl = null;
            this.state.pageAnalyzed = false;
        });
    }

    /**
     * Handle key down event (for space key)
     */
    handleKeyDown(event) {
        // Check if it's the space key and not in an input field
        if (event.code === 'Space' &&
            !['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) {
            // Prevent default scroll behavior
            event.preventDefault();

            // If space not pressed or timer not set
            if (!this.state.spaceKeyDown && this.state.longPressTimer === null) {
                this.state.spaceKeyDown = true;
                this.updateFeedbackText("Hold for voice control...", true);

                // Add visual feedback for space key press
                this.ui.assistantContainer.classList.add('space-pressed');

                // Set long press detection timer
                this.state.longPressTimer = setTimeout(() => {
                    // Long press triggered, activate assistant
                    this.updateFeedbackText("Assistant activated by space key. Speak now...", true);
                    this.activate();
                }, this.config.longPressThreshold);
            }
        }
    }

    /**
     * Handle key up event (for space key)
     */
    handleKeyUp(event) {
        if (event.code === 'Space') {
            // Reset space key state
            this.state.spaceKeyDown = false;

            // Remove visual feedback for space key press
            this.ui.assistantContainer.classList.remove('space-pressed');

            // Clear timer
            if (this.state.longPressTimer) {
                clearTimeout(this.state.longPressTimer);
                this.state.longPressTimer = null;
            }

            // If assistant is activated, deactivate it
            if (this.state.isActivated) {
                this.deactivate();
            } else {
                this.updateFeedbackText("Assistant ready. Hold space key or say 'Hey Assistant' to start.");
            }
        }
    }

    /**
     * Activate the assistant
     */
    activate() {
        this.state.isActivated = true;
        this.ui.activationIndicator.style.backgroundColor = '#f44336';
        this.ui.assistantContainer.style.width = '80px';
        this.ui.assistantContainer.style.height = '80px';
        this.ui.activationIndicator.classList.add('listening');

        // Check if we are in conversation mode
        if (this.state.inConversationMode) {
            this.updateFeedbackText("What would you like to do with this page?", true);
            this.speak("What would you like to do with this page?");
        } else {
            this.updateFeedbackText("Assistant activated. What can I help you with?", true);
            this.speak("Assistant activated. What can I help you with?");
        }

        this.startRecording();
    }

    /**
     * Deactivate the assistant
     */
    deactivate() {
        this.state.isActivated = false;
        this.ui.activationIndicator.style.backgroundColor = '#4CAF50';
        this.ui.activationIndicator.classList.remove('listening');
        this.ui.assistantContainer.style.width = '60px';
        this.ui.assistantContainer.style.height = '60px';

        // Keep dialog open if in conversation mode
        if (!this.state.inConversationMode) {
            this.ui.dialogContainer.style.display = 'none';
        }

        this.updateFeedbackText("Assistant deactivated. Hold space key or say 'Hey Assistant' to start.");
        this.stopRecording();
    }

    /**
     * Handle WebSocket messages from the backend
     */
    handleWebSocketMessage(data) {
        // Process summary and options
        if (data.summary) {
            console.log('Received summary:', data.summary);

            // Store navigation options for potential future use
            if (data.options && typeof data.options === 'object') {
                this.state.currentNavigationOptions = data.options;
            }

            // Handle HTML elements if present
            if (data.HTML_Element) {
                console.log('Received HTML elements:', data.HTML_Element);
            }

            // Enter conversation mode
            this.state.inConversationMode = true;

            // Mark page as analyzed
            this.state.pageAnalyzed = true;

            // Speak the summary
            this.speak(data.summary);

        } else if (typeof data === 'string') {
            // Log and speak the message
            console.log('Received text message:', data);
            this.speak(data);
        }
    }

    /**
     * Display navigation options in the dialog
     */
    displayNavigationOptions(options) {
        // This function is intentionally left empty
        return;
    }

    /**
     * Analyze the current URL
     */
    analyzeCurrentURL() {
        // Don't re-analyze if already analyzed
        if (this.state.pageAnalyzed) return;

        this.updateFeedbackText("Analyzing page...", true);

        // Use WebSocket to send URL instead of chrome.runtime message
        this.sendUrlToWebSocket(window.location.href);

        // Mark as analyzed
        this.state.pageAnalyzed = true;
    }

    /**
     * Process a user command in conversation mode
     */
    processUserCommand(command) {
        chrome.runtime.sendMessage(
            {
                type: "PROCESS_COMMAND",
                command: command
            },
            (response) => {
                if (response.error) {
                    this.updateFeedbackText(`Sorry, ${response.error}`, true);
                    this.speak(`Sorry, ${response.error}`);
                } else if (response.type === "URL_COMMAND") {
                    this.updateFeedbackText(response.text, true);
                    this.speak(response.text);
                    // Slight delay before navigation
                    setTimeout(() => {
                        window.location.href = response.url;
                    }, 1500);
                } else if (response.processing) {
                    this.updateFeedbackText("Processing your request...", true);
                }
            }
        );
    }

    /**
     * Update the feedback text
     */
    updateFeedbackText(text, show = false) {
        this.ui.feedbackText.textContent = text;

        if (show) {
            this.ui.feedbackText.style.display = 'block';
            // Auto-hide after 5 seconds
            setTimeout(() => {
                this.ui.feedbackText.style.display = 'none';
            }, 5000);
        } else {
            this.ui.feedbackText.style.display = 'none';
        }
    }

    /**
     * Start recording audio
     */
    async startRecording() {
        try {
            if (this.state.isRecording) return;

            // Reset audio chunks
            this.state.audioChunks = [];

            // Request microphone access
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

            // Create media recorder
            this.state.mediaRecorder = new MediaRecorder(stream);

            // Set up event handlers
            this.state.mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    this.state.audioChunks.push(event.data);
                }
            };

            this.state.mediaRecorder.onstop = () => {
                // Process the recorded audio
                if (this.state.audioChunks.length > 0) {
                    const audioBlob = new Blob(this.state.audioChunks, { type: 'audio/webm' });
                    this.processAudioData(audioBlob);
                }

                // Stop all tracks
                stream.getTracks().forEach(track => track.stop());
            };

            // Start recording
            this.state.mediaRecorder.start();
            this.state.isRecording = true;

            // Set a timeout to stop recording after a certain time
            setTimeout(() => {
                if (this.state.isRecording) {
                    this.stopRecording();
                }
            }, this.config.recordingTimeout);

        } catch (error) {
            console.error("Error starting recording:", error);
            this.updateFeedbackText("Could not access microphone.", true);
        }
    }

    /**
     * Stop recording audio
     */
    stopRecording() {
        if (!this.state.isRecording || !this.state.mediaRecorder) return;

        this.state.mediaRecorder.stop();
        this.state.isRecording = false;
    }

    /**
     * Process recorded audio data
     */
    async processAudioData(audioBlob) {
        try {
            this.updateFeedbackText("Processing...", true);

            // Send audio to background script
            const response = await chrome.runtime.sendMessage({
                type: "SEND_AUDIO",
                audioData: audioBlob,
                isActivated: this.state.isActivated
            });

            if (response.error) {
                throw new Error(response.error);
            }

            if (response.command) {
                this.handleCommand(response.command);
            } else if (response.transcription) {
                // Check if in conversation mode for special handling
                if (this.state.inConversationMode) {
                    this.processUserCommand(response.transcription);
                } else {
                    this.updateFeedbackText(response.transcription, true);
                }
            }

            // If still activated, start recording again
            if (this.state.isActivated) {
                this.startRecording();
            }

        } catch (error) {
            console.error("Error processing audio:", error);
            this.updateFeedbackText("Error processing audio.", true);
        }
    }

    /**
     * Handle a command received from the backend
     */
    handleCommand(command) {
        if (!command) return;

        switch (command.type) {
            case "WAKE_WORD_DETECTED":
                this.activate();
                break;

            case "STOP_WORD_DETECTED":
                this.deactivate();
                break;

            case "EXECUTE_ACTION":
                this.executeDomAction(command);
                break;

            case "PAGE_ANALYSIS":
                this.analyzePage();
                break;

            case "ANALYZE_URL":
                this.analyzeCurrentURL();
                break;

            case "URL_COMMAND":
                if (command.url) {
                    window.location.href = command.url;
                }
                break;
        }
    }

    /**
     * Execute a DOM action (click, input, etc.)
     */
    executeDomAction(command) {
        try {
            const { action_type, target, element_type, element_attributes } = command;

            if (action_type === "click") {
                // Find target element
                let element = null;

                // Try different strategies to find the element
                if (element_attributes && element_attributes.text) {
                    // Find by text content
                    element = Array.from(document.querySelectorAll('button, a, [role="button"]'))
                        .find(el => el.textContent.trim().toLowerCase() === element_attributes.text.toLowerCase());
                }

                if (!element && target) {
                    // Try to find by selector or text content
                    element = document.querySelector(target) ||
                        Array.from(document.querySelectorAll('button, a, [role="button"]'))
                            .find(el => el.textContent.trim().toLowerCase().includes(target.toLowerCase()));
                }

                if (element) {
                    element.click();
                    this.updateFeedbackText(`Clicked on: ${element.textContent || target}`, true);
                } else {
                    this.updateFeedbackText(`Could not find element: ${target}`, true);
                }
            }

            else if (action_type === "input") {
                // Find input element
                let element = null;

                if (target) {
                    // Try to find by selector or placeholder/label
                    element = document.querySelector(target) ||
                        document.querySelector(`input[placeholder*="${target}"]`) ||
                        document.querySelector(`label[for*="${target}"]`) ||
                        document.querySelector(`textarea[placeholder*="${target}"]`);
                }

                if (element && element.tagName === 'LABEL') {
                    const inputId = element.getAttribute('for');
                    if (inputId) {
                        element = document.getElementById(inputId);
                    }
                }

                if (element) {
                    element.focus();
                    if (command.input_text) {
                        element.value = command.input_text;
                        // Trigger input event
                        element.dispatchEvent(new Event('input', { bubbles: true }));
                    }
                    this.updateFeedbackText(`Entered text in: ${target}`, true);
                } else {
                    this.updateFeedbackText(`Could not find input: ${target}`, true);
                }
            }

        } catch (error) {
            console.error("Error executing DOM action:", error);
            this.updateFeedbackText("Error executing action on page.", true);
        }
    }

    /**
     * Analyze the current page
     */
    async analyzePage() {
        try {
            this.updateFeedbackText("Analyzing page...", true);

            // Call the analyzeCurrentURL method which sends the current URL to the backend
            this.analyzeCurrentURL();

        } catch (error) {
            console.error("Error analyzing page:", error);
            this.updateFeedbackText("Error analyzing page.", true);
        }
    }

    /**
     * Speak text using text-to-speech
     */
    speak(text) {
        // if (!this.config.audioFeedbackEnabled) return;

        if ('speechSynthesis' in window) {
            // Stop any ongoing speech
            window.speechSynthesis.cancel();

            // Create new utterance
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.rate = 1.0; // Normal speed
            utterance.pitch = 1.0; // Normal pitch
            utterance.volume = 1.0; // Full volume

            // Speak
            window.speechSynthesis.speak(utterance);
        }
    }

    /**
     * Connect to WebSocket server
     */
    connectWebSocket() {
        // Clean up any existing connection
        if (this.websocket.connection) {
            try {
                if (this.websocket.connection.readyState === WebSocket.OPEN ||
                    this.websocket.connection.readyState === WebSocket.CONNECTING) {
                    this.websocket.connection.close();
                }
            } catch (e) {
                console.error('Error closing old connection:', e);
            }
            this.websocket.connection = null;
        }

        try {
            console.log('Connecting to WebSocket:', this.websocket.url);

            // Create new connection
            this.websocket.connection = new WebSocket(this.websocket.url);

            this.websocket.connection.onopen = () => {
                console.log('WebSocket connection established');
                this.websocket.isConnected = true;
                this.websocket.reconnectAttempts = 0;

                // Send current URL (must use JSON formatted data)
                const data = { URL: window.location.href };
                console.log('Sending initial URL after connection:', data);
                this.websocket.connection.send(JSON.stringify(data));
            };

            this.websocket.connection.onmessage = (event) => {
                console.log('Received raw WebSocket message:', event.data);
                try {
                    // Parse response
                    let response;
                    
                    // Make sure event.data is not undefined before parsing
                    if (event.data) {
                        response = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
                        console.log('Parsed WebSocket response:', response);
                        
                        // Check if response is properly defined before handling it
                        if (response) {
                            this.handleWebSocketMessage(response);
                        } else {
                            console.warn('Empty response from WebSocket');
                        }
                    } else {
                        console.warn('Received undefined data from WebSocket');
                    }
                } catch (error) {
                    console.error('Error processing WebSocket response:', error);
                }
            };

            this.websocket.connection.onclose = (event) => {
                console.log(`WebSocket connection closed: code=${event.code}, reason=${event.reason || 'unknown'}`);
                this.websocket.isConnected = false;

                // Reconnection logic
                if (this.websocket.reconnectAttempts < this.websocket.maxReconnectAttempts) {
                    // Implement backoff algorithm
                    const delay = Math.min(
                        1000 * Math.pow(2, this.websocket.reconnectAttempts),
                        30000 // Maximum 30 seconds
                    );

                    this.websocket.reconnectAttempts++;
                    console.log(`Reconnecting in ${delay / 1000} seconds (${this.websocket.reconnectAttempts}/${this.websocket.maxReconnectAttempts})`);

                    setTimeout(() => this.connectWebSocket(), delay);
                }
            };

            this.websocket.connection.onerror = (error) => {
                console.error('WebSocket error:', error);
            };

        } catch (error) {
            console.error('Error creating WebSocket connection:', error);
        }
    }

    /**
     * Send URL to WebSocket server
     */
    sendUrlToWebSocket(url) {
        if (!url) {
            console.error('Attempted to send empty URL');
            return;
        }

        if (!this.websocket.connection ||
            this.websocket.connection.readyState !== WebSocket.OPEN) {
            console.log('WebSocket not connected, attempting to connect');

            // Store URL to send after connection is established
            this.pendingUrl = url;
            this.connectWebSocket();
            return;
        }

        try {
            // Data must be in text field or URL field
            const data = { URL: url };
            const jsonData = JSON.stringify(data);

            console.log('Sending data to WebSocket:', jsonData);

            // Send data
            this.websocket.connection.send(jsonData);
            console.log('Data sent');

            this.updateFeedbackText("Analyzing page...", true);
        } catch (error) {
            console.error('Error sending URL to WebSocket:', error);
        }
    }

    /**
     * Close WebSocket connection
     */
    closeWebSocket() {
        if (this.websocket.connection) {
            console.log('Actively closing WebSocket connection');
            this.websocket.connection.close();
            this.websocket.isConnected = false;
        }
    }
}

// Initialize the assistant when the page is loaded
document.addEventListener('DOMContentLoaded', () => {
    const assistant = new VoiceAssistant();
    assistant.init();
});

// Make sure it also works when loaded after DOMContentLoaded
if (document.readyState === 'complete' || document.readyState === 'interactive') {
    const assistant = new VoiceAssistant();
    assistant.init();
}

// Listen for navigation events (SPA support)
let lastUrl = location.href;
new MutationObserver(() => {
    const url = location.href;
    if (url !== lastUrl) {
        lastUrl = url;
        // Dispatch a custom event that our assistant can listen for
        window.dispatchEvent(new CustomEvent('locationchange', { detail: url }));
    }
}).observe(document, { subtree: true, childList: true });

function sendMessageToTab(tabId, message) {
    return new Promise((resolve, reject) => {
        try {
            chrome.tabs.sendMessage(tabId, message, response => {
                if (chrome.runtime.lastError) {
                    console.warn(`Error sending message: ${chrome.runtime.lastError.message}`);
                    resolve(null); // Gracefully handle error instead of rejecting
                } else {
                    resolve(response);
                }
            });
        } catch (error) {
            console.error("Error in sendMessage:", error);
            resolve(null);
        }
    });
}

// Use this function instead of directly calling chrome.tabs.sendMessage
async function notifyTabs(message) {
    try {
        const tabs = await chrome.tabs.query({});
        for (const tab of tabs) {
            await sendMessageToTab(tab.id, message);
        }
    } catch (error) {
        console.error("Error notifying tabs:", error);
    }
}

// Keep track of which tabs have content scripts loaded
const tabsWithContentScripts = new Set();

// Track tab closure to clean up
chrome.tabs.onRemoved.addListener((tabId) => {
    tabsWithContentScripts.delete(tabId);
});

// Only send messages to tabs with initialized content scripts
function sendMessageToReadyTab(tabId, message) {
    if (tabsWithContentScripts.has(tabId)) {
        return sendMessageToTab(tabId, message);
    } else {
        console.log(`Tab ${tabId} not ready, message not sent`);
        return Promise.resolve(null);
    }
}
