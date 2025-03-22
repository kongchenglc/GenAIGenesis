class VoiceAssistant {
    constructor() {
        this.recognition = new webkitSpeechRecognition();
        this.synthesis = window.speechSynthesis;
        this.isListening = false;
        this.setupRecognition();
        this.initializeElements();
        this.bindEvents();
    }

    setupRecognition() {
        this.recognition.continuous = true;
        this.recognition.interimResults = true;
        this.recognition.lang = 'en-US';

        this.recognition.onstart = () => {
            this.updateStatus('Listening...');
            this.isListening = true;
            this.updateButtonStates();
        };

        this.recognition.onend = () => {
            if (this.isListening) {
                this.recognition.start();
            } else {
                this.updateStatus('Ready to listen...');
                this.updateButtonStates();
            }
        };

        this.recognition.onresult = (event) => {
            const result = event.results[event.results.length - 1];
            if (result.isFinal) {
                const command = result[0].transcript.toLowerCase().trim();
                this.handleCommand(command);
            }
        };

        this.recognition.onerror = (event) => {
            console.error('Speech recognition error:', event.error);
            this.updateStatus('Error: ' + event.error);
            this.isListening = false;
            this.updateButtonStates();
        };
    }

    initializeElements() {
        this.startButton = document.getElementById('startListening');
        this.stopButton = document.getElementById('stopListening');
        this.statusElement = document.getElementById('status');
        this.settingsButton = document.getElementById('settingsButton');
    }

    bindEvents() {
        this.startButton.addEventListener('click', () => this.startListening());
        this.stopButton.addEventListener('click', () => this.stopListening());
        this.settingsButton.addEventListener('click', () => this.openSettings());
    }

    startListening() {
        try {
            this.recognition.start();
            this.isListening = true;
            this.updateButtonStates();
        } catch (error) {
            console.error('Error starting recognition:', error);
        }
    }

    stopListening() {
        this.isListening = false;
        this.recognition.stop();
        this.updateButtonStates();
    }

    updateStatus(message) {
        this.statusElement.textContent = message;
        this.speak(message);
    }

    updateButtonStates() {
        this.startButton.disabled = this.isListening;
        this.stopButton.disabled = !this.isListening;
    }

    speak(text) {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 1;
        utterance.pitch = 1;
        this.synthesis.speak(utterance);
    }

    async handleCommand(command) {
        this.updateStatus('Processing: ' + command);

        if (command.includes('search for')) {
            const searchTerm = command.replace('search for', '').trim();
            await this.searchWeb(searchTerm);
        } else if (command.includes('go to')) {
            const website = command.replace('go to', '').trim();
            await this.navigateToWebsite(website);
        } else if (command.includes('read this page')) {
            await this.readPage();
        } else if (command.includes('summarize')) {
            await this.summarizePage();
        } else if (command.includes('switch to tab')) {
            const tabNumber = command.match(/\d+/);
            if (tabNumber) {
                await this.switchTab(parseInt(tabNumber[0]));
            }
        } else {
            this.updateStatus('Command not recognized. Please try again.');
        }
    }

    async searchWeb(term) {
        try {
            await chrome.runtime.sendMessage({
                action: 'search',
                searchTerm: term
            });
            this.updateStatus('Searching for: ' + term);
        } catch (error) {
            console.error('Search error:', error);
            this.updateStatus('Error performing search');
        }
    }

    async navigateToWebsite(website) {
        try {
            await chrome.runtime.sendMessage({
                action: 'navigate',
                website: website
            });
            this.updateStatus('Navigating to: ' + website);
        } catch (error) {
            console.error('Navigation error:', error);
            this.updateStatus('Error navigating to website');
        }
    }

    async readPage() {
        try {
            const response = await chrome.runtime.sendMessage({
                action: 'readPage'
            });
            this.updateStatus('Reading page content...');
        } catch (error) {
            console.error('Read page error:', error);
            this.updateStatus('Error reading page');
        }
    }

    async summarizePage() {
        try {
            const response = await chrome.runtime.sendMessage({
                action: 'summarize'
            });
            this.updateStatus('Generating summary...');
        } catch (error) {
            console.error('Summarize error:', error);
            this.updateStatus('Error summarizing page');
        }
    }

    async switchTab(tabNumber) {
        try {
            await chrome.runtime.sendMessage({
                action: 'switchTab',
                tabNumber: tabNumber
            });
            this.updateStatus('Switching to tab ' + tabNumber);
        } catch (error) {
            console.error('Tab switch error:', error);
            this.updateStatus('Error switching tabs');
        }
    }

    openSettings() {
        chrome.runtime.openOptionsPage();
    }
}

// Initialize the voice assistant when the popup loads
document.addEventListener('DOMContentLoaded', () => {
    new VoiceAssistant();
}); 