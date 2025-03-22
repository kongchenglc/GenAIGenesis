// Default settings
const defaultSettings = {
    apiKey: '',
    voice: '',
    rate: 1,
    pitch: 1,
    highlightColor: '#4A90E2'
};

// DOM Elements
const elements = {
    apiKey: document.getElementById('apiKey'),
    voice: document.getElementById('voice'),
    rate: document.getElementById('rate'),
    pitch: document.getElementById('pitch'),
    rateValue: document.getElementById('rateValue'),
    pitchValue: document.getElementById('pitchValue'),
    highlightColor: document.getElementById('highlightColor'),
    testVoice: document.getElementById('testVoice'),
    save: document.getElementById('save'),
    status: document.getElementById('status')
};

// Initialize settings
async function initializeSettings() {
    // Load saved settings
    const settings = await chrome.storage.sync.get(defaultSettings);
    
    // Set input values
    elements.apiKey.value = settings.apiKey;
    elements.rate.value = settings.rate;
    elements.pitch.value = settings.pitch;
    elements.highlightColor.value = settings.highlightColor;
    
    // Update preview values
    elements.rateValue.textContent = settings.rate;
    elements.pitchValue.textContent = settings.pitch;
    
    // Populate voice options
    populateVoices();
    
    // Set selected voice if saved
    if (settings.voice) {
        elements.voice.value = settings.voice;
    }
}

// Populate available voices
function populateVoices() {
    // Clear existing options
    elements.voice.innerHTML = '';
    
    // Get available voices
    const voices = speechSynthesis.getVoices();
    
    // Add voices to select element
    voices.forEach(voice => {
        const option = document.createElement('option');
        option.value = voice.name;
        option.textContent = `${voice.name} (${voice.lang})`;
        elements.voice.appendChild(option);
    });
}

// Handle voice changes
speechSynthesis.onvoiceschanged = populateVoices;

// Save settings
async function saveSettings() {
    try {
        await chrome.storage.sync.set({
            apiKey: elements.apiKey.value,
            voice: elements.voice.value,
            rate: parseFloat(elements.rate.value),
            pitch: parseFloat(elements.pitch.value),
            highlightColor: elements.highlightColor.value
        });
        
        showStatus('Settings saved successfully!', 'success');
    } catch (error) {
        console.error('Error saving settings:', error);
        showStatus('Error saving settings. Please try again.', 'error');
    }
}

// Test voice settings
function testVoiceSettings() {
    const testText = 'This is a test of the voice settings.';
    const utterance = new SpeechSynthesisUtterance(testText);
    
    // Apply current settings
    utterance.voice = speechSynthesis.getVoices().find(v => v.name === elements.voice.value);
    utterance.rate = parseFloat(elements.rate.value);
    utterance.pitch = parseFloat(elements.pitch.value);
    
    // Speak the test text
    speechSynthesis.speak(utterance);
}

// Show status message
function showStatus(message, type) {
    elements.status.textContent = message;
    elements.status.className = `status ${type}`;
    
    // Hide status after 3 seconds
    setTimeout(() => {
        elements.status.className = 'status';
    }, 3000);
}

// Event Listeners
elements.rate.addEventListener('input', () => {
    elements.rateValue.textContent = elements.rate.value;
});

elements.pitch.addEventListener('input', () => {
    elements.pitchValue.textContent = elements.pitch.value;
});

elements.testVoice.addEventListener('click', testVoiceSettings);
elements.save.addEventListener('click', saveSettings);

// Initialize settings when page loads
document.addEventListener('DOMContentLoaded', initializeSettings); 