let recognition = null;
let permissionGranted = false;
let stream = null;

document.addEventListener('DOMContentLoaded', () => {
    updateStatus('请在弹出的权限请求中点击"允许"');
    // 初始化时不再自动请求权限，而是等待用户操作
    
    // 添加重试按钮的事件监听
    const retryButton = document.getElementById('retry-button');
    if (retryButton) {
        retryButton.addEventListener('click', () => {
            updateStatus('正在重新请求麦克风权限...');
            requestMicrophonePermission();
        });
    }
});

async function requestMicrophonePermission() {
    try {
        // 使用带有降噪和回声消除的约束
        const constraints = {
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
            },
            video: false
        };
        
        // 尝试请求麦克风权限
        stream = await navigator.mediaDevices.getUserMedia(constraints);
        
        // 权限获取成功
        permissionGranted = true;
        updateStatus('麦克风权限已授予！语音识别已准备就绪');
        
        // 通知background.js权限已授予
        chrome.runtime.sendMessage({ type: 'PERMISSION_GRANTED' });

        // 显示成功状态并隐藏重试按钮
        document.getElementById('status').classList.add('success');
        document.getElementById('status').classList.remove('error');
        const retryButton = document.getElementById('retry-button');
        if (retryButton) {
            retryButton.style.display = 'none';
        }
        
        return true;
    } catch (error) {
        console.error('麦克风权限被拒绝:', error);
        permissionGranted = false;
        
        // 通知background.js权限被拒绝
        chrome.runtime.sendMessage({ type: 'PERMISSION_DENIED' });
        
        // 显示错误状态并显示重试按钮
        document.getElementById('status').classList.add('error');
        document.getElementById('status').classList.remove('success');
        document.getElementById('retry-button').style.display = 'block';
        
        if (error.name === 'NotAllowedError') {
            updateStatus('您拒绝了麦克风权限，请点击"重试"并允许使用麦克风');
        } else if (error.name === 'NotFoundError') {
            updateStatus('未找到麦克风设备，请确保您的设备有麦克风并正常工作');
        } else {
            updateStatus('获取麦克风权限时出错: ' + error.message);
        }
        
        return false;
    }
}

function startVoiceRecognition() {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
        console.error('您的浏览器不支持语音识别');
        updateStatus('您的浏览器不支持语音识别功能');
        return;
    }

    // 首先确保已获得麦克风权限
    if (!permissionGranted && !stream) {
        requestMicrophonePermission().then(granted => {
            if (granted) {
                initSpeechRecognition();
            }
        });
    } else {
        initSpeechRecognition();
    }
}

function initSpeechRecognition() {
    // 使用标准SpeechRecognition API或WebKit前缀版本
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    
    if (recognition) {
        // 如果已经存在识别实例，先停止它
        try {
            recognition.stop();
        } catch (e) {
            console.log('停止先前的语音识别实例:', e);
        }
    }
    
    recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'zh-CN'; // 设置为中文识别

    recognition.onstart = () => {
        console.log('语音识别已启动');
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
        console.error('识别错误:', event.error);
        updateStatus('语音识别出错: ' + event.error);
        
        // 如果是非致命错误，尝试重新启动
        if (event.error !== 'not-allowed' && event.error !== 'service-not-allowed') {
            setTimeout(() => {
                if (permissionGranted) {
                    initSpeechRecognition();
                }
            }, 1000);
        } else {
            // 权限错误
            document.getElementById('status').classList.add('error');
            document.getElementById('retry-button').style.display = 'block';
        }
    };

    recognition.onend = () => {
        console.log('语音识别已结束');
        // 只有在权限已获取的情况下才自动重启
        if (permissionGranted) {
            setTimeout(() => {
                recognition.start();
            }, 500);
        }
    };

    // 开始识别
    try {
        recognition.start();
    } catch (e) {
        console.error('启动语音识别失败:', e);
        updateStatus('启动语音识别失败: ' + e.message);
    }
}

function handleVoiceCommand(command) {
    console.log('收到命令:', command);
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

        if (url) {
            chrome.tabs.create({ url });
            updateStatus(`正在打开 ${url}`);
        }
    }
}

function updateStatus(message) {
    console.log('状态更新:', message);
    const statusElement = document.getElementById('status');
    if (statusElement) {
        statusElement.textContent = message;
    }
}

// 监听来自background.js的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'START_VOICE_RECOGNITION') {
        console.log('收到开始语音识别的请求');
        startVoiceRecognition();
    }
});