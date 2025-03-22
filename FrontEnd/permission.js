let recognition = null;

document.addEventListener('DOMContentLoaded', () => {
    requestMicrophonePermission();
});

async function requestMicrophonePermission() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        // 权限获取成功
        chrome.runtime.sendMessage({ type: 'PERMISSION_GRANTED' });

        // 直接在permission页面开始语音识别
        startVoiceRecognition();
    } catch (error) {
        console.error('Microphone permission denied:', error);
    }
}

function startVoiceRecognition() {
    if (!('webkitSpeechRecognition' in window)) {
        console.error('Speech recognition not supported');
        return;
    }

    recognition = new webkitSpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'zh-CN'; // 设置为中文识别

    recognition.onstart = () => {
        console.log('Voice recognition started');
        updateStatus('正在听取语音命令...');
    };

    recognition.onresult = (event) => {
        const transcript = Array.from(event.results)
            .map(result => result[0].transcript)
            .join('');

        // 处理语音命令
        handleVoiceCommand(transcript.toLowerCase());
    };

    recognition.onerror = (event) => {
        console.error('Recognition error:', event.error);
        updateStatus('语音识别出错，正在重新启动...');
        // 出错时自动重启
        setTimeout(() => {
            startVoiceRecognition();
        }, 1000);
    };

    recognition.onend = () => {
        console.log('Voice recognition ended');
        // 自动重新启动
        recognition.start();
    };

    recognition.start();
}

function handleVoiceCommand(command) {
    console.log('Received command:', command);
    updateStatus(`收到命令: ${command}`);

    // 处理打开网页的命令
    if (command.includes('打开') || command.includes('访问')) {
        let url = '';
        if (command.includes('百度')) {
            url = 'https://www.baidu.com';
        } else if (command.includes('谷歌')) {
            url = 'https://www.google.com';
        } else if (command.includes('必应')) {
            url = 'https://www.bing.com';
        }
        // ... 添加更多网站

        if (url) {
            chrome.tabs.create({ url });
            updateStatus(`正在打开 ${url}`);
        }
    }
}

function updateStatus(message) {
    const statusElement = document.getElementById('status');
    if (statusElement) {
        statusElement.textContent = message;
    }
}