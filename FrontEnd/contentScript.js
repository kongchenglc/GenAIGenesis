let recognition = null;
let voiceOverlay = null;

// 创建悬浮窗
function createVoiceOverlay() {
    voiceOverlay = document.createElement('div');
    voiceOverlay.id = 'voice-control-overlay';
    voiceOverlay.innerHTML = `
        <div class="voice-status">
            <div class="voice-indicator"></div>
            <span class="status-text">正在听取命令...</span>
        </div>
    `;
    document.body.appendChild(voiceOverlay);

    // 添加样式
    const style = document.createElement('style');
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
            align-items: center;
            transition: opacity 0.3s;
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
            background: #4CAF50;
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
    `;
    document.head.appendChild(style);
}

// 更新状态显示
function updateStatus(message) {
    if (voiceOverlay) {
        const statusText = voiceOverlay.querySelector('.status-text');
        if (statusText) {
            statusText.textContent = message;
        }
    }
}

// 初始化语音识别
function initVoiceRecognition() {
    if (!('webkitSpeechRecognition' in window)) {
        console.error('Speech recognition not supported');
        return;
    }

    recognition = new webkitSpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'zh-CN';

    recognition.onstart = () => {
        console.log('Voice recognition started');
        updateStatus('正在听取命令...');
    };

    recognition.onresult = (event) => {
        const transcript = Array.from(event.results)
            .map(result => result[0].transcript)
            .join('');

        handleVoiceCommand(transcript.toLowerCase());
    };

    recognition.onerror = (event) => {
        console.error('Recognition error:', event.error);
        updateStatus('语音识别出错，正在重新启动...');
        setTimeout(() => {
            startVoiceRecognition();
        }, 1000);
    };

    recognition.onend = () => {
        console.log('Voice recognition ended');
        recognition.start();
    };
}

// 处理语音命令
function handleVoiceCommand(command) {
    console.log('Received command:', command);
    updateStatus(`收到命令: ${command}`);

    if (command.includes('打开') || command.includes('访问')) {
        let url = '';
        if (command.includes('百度')) {
            url = 'https://www.baidu.com';
        } else if (command.includes('谷歌')) {
            url = 'https://www.google.com';
        } else if (command.includes('必应')) {
            url = 'https://www.bing.com';
        }

        if (url) {
            chrome.runtime.sendMessage({ 
                type: 'OPEN_URL', 
                url: url 
            });
            updateStatus(`正在打开 ${url}`);
        }
    }
}

// 启动语音识别
function startVoiceRecognition() {
    if (!recognition) {
        initVoiceRecognition();
    }
    try {
        recognition.start();
    } catch (e) {
        console.error('Recognition start error:', e);
    }
}

// 请求麦克风权限并初始化
async function initialize() {
    try {
        await navigator.mediaDevices.getUserMedia({ audio: true });
        createVoiceOverlay();
        startVoiceRecognition();
    } catch (error) {
        console.error('Microphone permission denied:', error);
    }
}

// 当页面加载完成后初始化
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
} else {
    initialize();
}