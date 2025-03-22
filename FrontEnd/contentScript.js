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
      spaceKeyEnabled: true, // 启用空格键控制
      longPressThreshold: 500, // 长按空格键的时间阈值（毫秒）
      showSpaceKeyHint: true // 显示空格键提示
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

    // 添加空格键长按监听
    if (this.config.spaceKeyEnabled) {
      document.addEventListener('keydown', this.handleKeyDown);
      document.addEventListener('keyup', this.handleKeyUp);
    }
  }

  /**
   * Handle key down event (for space key)
   */
  handleKeyDown(event) {
    // 检查是否为空格键且不在输入框中
    if (event.code === 'Space' && 
        !['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) {
      // 阻止页面滚动默认行为
      event.preventDefault();
      
      // 如果未按下空格或定时器未设置
      if (!this.state.spaceKeyDown && this.state.longPressTimer === null) {
        this.state.spaceKeyDown = true;
        this.updateFeedbackText("Hold for voice control...", true);
        
        // 添加空格键按下的视觉效果
        this.ui.assistantContainer.classList.add('space-pressed');
        
        // 设置长按检测定时器
        this.state.longPressTimer = setTimeout(() => {
          // 长按触发，激活助手
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
      // 重置空格键状态
      this.state.spaceKeyDown = false;
      
      // 移除空格键按下的视觉效果
      this.ui.assistantContainer.classList.remove('space-pressed');
      
      // 清除定时器
      if (this.state.longPressTimer) {
        clearTimeout(this.state.longPressTimer);
        this.state.longPressTimer = null;
      }
      
      // 如果助手已激活，则停止录音
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
        this.updateFeedbackText(response.transcription, true);
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
      
      // Collect page content
      const pageContent = {
        html: document.documentElement.outerHTML,
        text: document.body.innerText,
        url: window.location.href
      };
      
      // Send to background script for analysis
      const response = await chrome.runtime.sendMessage({
        type: "ANALYZE_PAGE",
        pageContent: pageContent
      });
      
      if (response.error) {
        throw new Error(response.error);
      }
      
      // Process and present analysis results
      if (response.main_content) {
        this.speak(response.main_content);
        this.updateFeedbackText(response.main_content, true);
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
