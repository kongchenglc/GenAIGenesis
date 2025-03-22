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
      audioFeedbackEnabled: true,
      spaceKeyEnabled: true, // Enable space key control
      longPressThreshold: 500, // Long press threshold in milliseconds
      showSpaceKeyHint: true // Show space key hint
    };

    // State management
    this.state = {
      isActivated: false,
      isRecording: false,
      mediaRecorder: null,
      audioChunks: [],
      spaceKeyDown: false,
      longPressTimer: null
    };

    // Initialize UI elements
    this.ui = {
      assistantContainer: null,
      activationIndicator: null,
      feedbackText: null,
      spaceKeyHint: null
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
    this.handleActionResponse = this.handleActionResponse.bind(this);
    this.executeActionItem = this.executeActionItem.bind(this);
  }

  /**
   * Initialize the assistant
   */
  async init() {
    try {
      // Create UI
      this.createUI();
      
      // Set up listeners
      this.setupEventListeners();
      
      // Display ready message
      this.updateFeedbackText("Assistant ready. Hold space key or say 'Hey Assistant' to start.");
      
      // Show space key hint if enabled
      if (this.config.showSpaceKeyHint) {
        this.showSpaceKeyHint();
      }
      
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
    spaceKeyHint.innerHTML = 'Hold <kbd>Space</kbd> for voice control';
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
    
    // Listen for messages from the background script
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.type === "WEBSOCKET_MESSAGE") {
        this.handleWebSocketMessage(message.data);
      }
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
    this.updateFeedbackText("Assistant activated. What can I help you with?", true);
    this.speak("Assistant activated. What can I help you with?");
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
    this.updateFeedbackText("Assistant deactivated. Hold space key or say 'Hey Assistant' to start.");
    this.stopRecording();
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
      console.log("=== Starting recording ===");
      // Reset audio chunks
      this.state.audioChunks = [];
      
      // Request microphone access
      console.log("Requesting microphone access");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      // Create media recorder
      console.log("Creating MediaRecorder");
      this.state.mediaRecorder = new MediaRecorder(stream);
      
      // Set up event handlers
      this.state.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          console.log(`Received audio chunk: ${event.data.size} bytes`);
          this.state.audioChunks.push(event.data);
        }
      };
      
      this.state.mediaRecorder.onstop = () => {
        console.log(`Recording stopped, total chunks: ${this.state.audioChunks.length}`);
        if (this.state.audioChunks.length > 0) {
          // Combine audio chunks
          const audioBlob = new Blob(this.state.audioChunks, { type: 'audio/webm' });
          console.log(`Created audio blob: ${audioBlob.size} bytes`);
          this.processAudioData(audioBlob);
        } else {
          console.log("No audio data collected during recording");
          if (this.state.isActivated) {
            this.startRecording();
          }
        }
      };
      
      // Start recording
      console.log("Starting MediaRecorder");
      this.state.mediaRecorder.start();
      this.state.isRecording = true;
      
      // Set recording timeout
      setTimeout(() => {
        if (this.state.isRecording && this.state.mediaRecorder && this.state.mediaRecorder.state === 'recording') {
          console.log(`Recording timeout reached (${this.config.recordingTimeout}ms), stopping recording`);
          this.stopRecording();
        }
      }, this.config.recordingTimeout);
      
    } catch (error) {
      console.error("Error starting recording:", error);
      this.updateFeedbackText("Error accessing microphone. Please check permissions.", true);
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
      console.log("=== Processing audio data ===");
      console.log(`Audio blob size: ${audioBlob.size} bytes, type: ${audioBlob.type}`);
      this.updateFeedbackText("Processing...", true);
      
      // Send audio to background script
      console.log("Sending audio to background script...");
      const response = await chrome.runtime.sendMessage({
        type: "SEND_AUDIO",
        audioData: audioBlob,
        isActivated: this.state.isActivated
      });
      
      console.log(`Received response from background script:`, response);
      
      if (response.error) {
        console.error(`Error from backend: ${response.error}`);
        throw new Error(response.error);
      }
      
      if (response.action_items && response.is_action_required) {
        // Handle ActionResponse from backend
        console.log(`Received action items (${response.action_items.length})`, response.action_items);
        this.handleActionResponse(response);
      } else if (response.message) {
        // Handle WebSocketResponse
        console.log(`Received message: ${response.message}`);
        this.updateFeedbackText(response.message, true);
        if (response.is_activated !== undefined) {
          console.log(`Activation state from backend: ${response.is_activated}`);
          // Update activation state if provided
          if (response.is_activated !== this.state.isActivated) {
            if (response.is_activated) {
              this.activate();
            } else {
              this.deactivate();
            }
          }
        }
      }
      
      // If still activated, start recording again
      if (this.state.isActivated) {
        console.log("Still activated, starting recording again");
        this.startRecording();
      }
      
    } catch (error) {
      console.error("Error processing audio:", error);
      this.updateFeedbackText("Error processing audio.", true);
    }
  }

  /**
   * Handle action response from the backend
   */
  handleActionResponse(response) {
    if (!response.action_items || !response.is_action_required) return;
    
    // Process each action item
    for (const actionItem of response.action_items) {
      this.executeActionItem(actionItem);
    }
    
    // Give feedback about actions
    if (response.action_items.length > 0) {
      const actionSummary = `Executed ${response.action_items.length} actions.`;
      this.updateFeedbackText(actionSummary, true);
      this.speak(actionSummary);
    }
  }
  
  /**
   * Execute a single action item
   */
  executeActionItem(actionItem) {
    try {
      const { description, action_type, target_element, parameters } = actionItem;
      
      // Log action for debugging
      console.log(`Executing action: ${action_type} on ${target_element}`);
      
      switch (action_type) {
        case "click":
          this.executeDomAction({
            action_type: "click",
            target: target_element,
            element_attributes: parameters
          });
          break;
          
        case "input":
          this.executeDomAction({
            action_type: "input",
            target: target_element,
            input_text: parameters?.text || ""
          });
          break;
          
        case "navigate":
          if (parameters && parameters.url) {
            window.location.href = parameters.url;
          }
          break;
          
        case "analyze":
          this.analyzePage();
          break;
          
        default:
          console.warn(`Unknown action type: ${action_type}`);
      }
      
    } catch (error) {
      console.error("Error executing action item:", error);
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
      console.log("=== Executing DOM action ===");
      console.log("Command:", command);
      const { action_type, target, element_type, element_attributes } = command;
      
      if (action_type === "click") {
        console.log(`Click action on target: ${target}`);
        console.log(`Element attributes:`, element_attributes);
        
        // Find target element
        let element = null;
        
        // Try different strategies to find the element
        if (element_attributes && element_attributes.text) {
          console.log(`Searching for element with text: "${element_attributes.text}"`);
          // Find by text content
          element = Array.from(document.querySelectorAll('button, a, [role="button"]'))
            .find(el => el.textContent.trim().toLowerCase() === element_attributes.text.toLowerCase());
          
          if (element) {
            console.log(`Found element by text: ${element.tagName}, text: ${element.textContent.trim()}`);
          } else {
            console.log(`Could not find element with exact text: "${element_attributes.text}"`);
          }
        }
        
        if (!element && target) {
          console.log(`Trying to find element by selector or text containing: ${target}`);
          // Try to find by selector or text content
          element = document.querySelector(target);
          if (element) {
            console.log(`Found element by selector: ${element.tagName}, text: ${element.textContent.trim()}`);
          } else {
            // Try to find by partial text match
            element = Array.from(document.querySelectorAll('button, a, [role="button"]'))
              .find(el => el.textContent.trim().toLowerCase().includes(target.toLowerCase()));
            
            if (element) {
              console.log(`Found element by partial text match: ${element.tagName}, text: ${element.textContent.trim()}`);
            } else {
              console.log(`Could not find element by selector or text containing: ${target}`);
            }
          }
        }
        
        if (element) {
          console.log(`Clicking on element: ${element.tagName}, text: ${element.textContent.trim()}`);
          element.click();
          this.updateFeedbackText(`Clicked on: ${element.textContent || target}`, true);
        } else {
          console.log(`Failed to find any clickable element for command`, command);
          this.updateFeedbackText(`Could not find element: ${target}`, true);
        }
      }
      
      else if (action_type === "input") {
        console.log(`Input action on target: ${target}`);
        // Find input element
        let element = null;
        
        if (target) {
          console.log(`Searching for input element with target: ${target}`);
          // Try to find by selector or placeholder/label
          element = document.querySelector(target);
          if (element) {
            console.log(`Found input element by selector: ${element.tagName}`);
          } else {
            // Try by placeholder
            element = document.querySelector(`input[placeholder*="${target}"]`);
            if (element) {
              console.log(`Found input element by placeholder: ${element.placeholder}`);
            } else {
              // Try by label
              element = document.querySelector(`label[for*="${target}"]`);
              if (element) {
                console.log(`Found label element for input: ${element.textContent.trim()}`);
              } else {
                // Try textarea
                element = document.querySelector(`textarea[placeholder*="${target}"]`);
                if (element) {
                  console.log(`Found textarea element by placeholder: ${element.placeholder}`);
                } else {
                  console.log(`Could not find input element for target: ${target}`);
                }
              }
            }
          }
        }
        
        if (element && element.tagName === 'LABEL') {
          const inputId = element.getAttribute('for');
          if (inputId) {
            console.log(`Found label with for=${inputId}, looking for corresponding input`);
            element = document.getElementById(inputId);
            if (element) {
              console.log(`Found input with id=${inputId}`);
            } else {
              console.log(`Could not find input with id=${inputId}`);
            }
          }
        }
        
        if (element) {
          console.log(`Focusing input element: ${element.tagName}, id: ${element.id || 'none'}`);
          element.focus();
          if (command.input_text) {
            console.log(`Setting input value to: "${command.input_text}"`);
            element.value = command.input_text;
            // Trigger input event
            element.dispatchEvent(new Event('input', { bubbles: true }));
          }
          this.updateFeedbackText(`Entered text in: ${target}`, true);
        } else {
          console.log(`Failed to find any input element for command`, command);
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
      console.log("=== Analyzing page ===");
      console.log(`Current URL: ${window.location.href}`);
      this.updateFeedbackText("Analyzing page...", true);
      
      // Collect page content according to PageSchema
      const pageContent = {
        html: document.documentElement.outerHTML,
        text: document.body.innerText,
        url: window.location.href
      };
      
      console.log(`Page content collected - HTML length: ${pageContent.html.length}, Text length: ${pageContent.text.length}`);
      
      // Send to background script for analysis
      console.log("Sending page content to background script for analysis");
      const response = await chrome.runtime.sendMessage({
        type: "ANALYZE_PAGE",
        pageContent: pageContent
      });
      
      console.log("Received page analysis response:", response);
      
      if (response.error) {
        console.error(`Error analyzing page: ${response.error}`);
        throw new Error(response.error);
      }
      
      // Process and present analysis results
      if (response.message) {
        console.log(`Page analysis message: ${response.message}`);
        this.speak(response.message);
        this.updateFeedbackText(response.message, true);
      }
      
      if (response.summary) {
        console.log(`Page summary: ${response.summary}`);
      }
      
      if (response.interactive_elements && response.interactive_elements.length > 0) {
        console.log(`Found ${response.interactive_elements.length} interactive elements:`, 
          response.interactive_elements);
      }
      
    } catch (error) {
      console.error("Error analyzing page:", error);
      this.updateFeedbackText("Error analyzing page.", true);
    }
  }

  /**
   * Speak text using text-to-speech
   */
  speak(text) {
    if (!this.config.audioFeedbackEnabled) return;
    
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
   * Handle WebSocket messages from the background script
   */
  handleWebSocketMessage(data) {
    try {
      console.log("=== Received WebSocket message ===", data);
      
      // Handle WebSocketResponse schema
      if (data.message) {
        console.log(`WebSocket message: ${data.message}`);
        this.updateFeedbackText(data.message, true);
        this.speak(data.message);
        
        if (data.is_activated !== undefined) {
          console.log(`WebSocket activation state: ${data.is_activated}`);
          // Update activation state if provided
          if (data.is_activated !== this.state.isActivated) {
            if (data.is_activated) {
              console.log("Activating based on WebSocket message");
              this.activate();
            } else {
              console.log("Deactivating based on WebSocket message");
              this.deactivate();
            }
          }
        }
      }
      
      // Handle ActionResponse schema
      if (data.action_items && data.is_action_required) {
        console.log(`WebSocket action items (${data.action_items.length}):`, data.action_items);
        this.handleActionResponse(data);
      }
    } catch (error) {
      console.error("Error handling WebSocket message:", error);
    }
  }
}

// Initialize assistant only once
if (document.readyState === 'complete' || document.readyState === 'interactive') {
  // Document already loaded, initialize immediately
  const assistant = new VoiceAssistant();
  assistant.init();
} else {
  // Wait for document to load
  document.addEventListener('DOMContentLoaded', () => {
    const assistant = new VoiceAssistant();
    assistant.init();
  });
}
