class VoiceAssistant {
    constructor() {
        this.synthesis = window.speechSynthesis;
        this.isListening = false;
        this.permissionPage = null;
        this.initializeElements();
        this.bindEvents();
    }

    initializeElements() {
        this.startButton = document.getElementById('startListening');
        this.stopButton = document.getElementById('stopListening');
        this.statusElement = document.getElementById('status');
        this.settingsButton = document.getElementById('settingsButton');
    }

    bindEvents() {
        this.startButton.addEventListener('click', () => this.requestMicrophoneAccess());
        this.stopButton.addEventListener('click', () => this.stopListening());
        this.settingsButton.addEventListener('click', () => this.openSettings());
    }

    requestMicrophoneAccess() {
        this.updateStatus('Opening microphone permission page...');
        
        // 获取扩展ID以构建完整URL
        const extensionId = chrome.runtime.id;
        const permissionUrl = `chrome-extension://${extensionId}/permission.html`;
        
        // 打开新页面来请求麦克风权限
        this.permissionPage = window.open(permissionUrl, 'voice_permission', 
            'width=500,height=400,resizable=yes');
            
        // 设置消息监听器以接收来自权限页面的消息
        window.addEventListener('message', this.handlePermissionMessage.bind(this));
    }

    handlePermissionMessage(event) {
        // 确保消息来自我们的权限页面
        const extensionId = chrome.runtime.id;
        if (event.origin !== `chrome-extension://${extensionId}`) return;

        if (event.data.type === 'permission_granted') {
            this.updateStatus('Microphone access granted. Listening...');
            this.isListening = true;
            this.updateButtonStates();
            
            // 通知后台脚本开始监听
            chrome.runtime.sendMessage({
                action: 'startListening',
            });
        } 
        else if (event.data.type === 'permission_denied') {
            this.updateStatus('Microphone access denied. Please try again.');
            this.isListening = false;
            this.updateButtonStates();
        }
        else if (event.data.type === 'command_recognized') {
            // 处理来自权限页面的语音命令
            this.handleCommand(event.data.command);
        }
    }

    stopListening() {
        this.isListening = false;
        this.updateButtonStates();
        this.updateStatus('Stopped listening');
        
        // 通知后台脚本停止监听
        chrome.runtime.sendMessage({
            action: 'stopListening'
        });
        
        // 关闭权限页面（如果仍然打开）
        if (this.permissionPage && !this.permissionPage.closed) {
            this.permissionPage.close();
        }
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