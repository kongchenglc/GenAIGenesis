// 语音识别对象
let recognition = null;
let isListening = false;

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', () => {
    // 初始化UI元素
    const requestPermissionBtn = document.getElementById('requestPermission');
    const stopListeningBtn = document.getElementById('stopListening');
    const statusElement = document.getElementById('status');
    const resultElement = document.getElementById('result');
    
    // 通知后台脚本此页面已打开
    chrome.runtime.sendMessage({ action: 'setPermissionTabId' });
    
    // 添加事件监听器
    requestPermissionBtn.addEventListener('click', requestMicrophonePermission);
    stopListeningBtn.addEventListener('click', stopListening);
    
    // 监听来自后台脚本的消息
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === 'stopListening') {
            stopListening();
        }
    });
    
    // 初始化Web Speech API
    function initializeSpeechRecognition() {
        if ('webkitSpeechRecognition' in window) {
            recognition = new webkitSpeechRecognition();
        } else if ('SpeechRecognition' in window) {
            recognition = new SpeechRecognition();
        } else {
            statusElement.textContent = '您的浏览器不支持语音识别功能。';
            return false;
        }
        
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'en-US';
        
        recognition.onstart = () => {
            statusElement.textContent = '正在监听...';
            isListening = true;
            updateButtonStates();
        };
        
        recognition.onend = () => {
            if (isListening) {
                // 如果仍然应该监听，则重新启动
                recognition.start();
            } else {
                statusElement.textContent = '语音识别已停止。';
                updateButtonStates();
            }
        };
        
        recognition.onresult = (event) => {
            const result = event.results[event.results.length - 1];
            if (result.isFinal) {
                const command = result[0].transcript.toLowerCase().trim();
                resultElement.textContent = command;
                
                // 将识别到的命令发送给扩展
                window.opener.postMessage({
                    type: 'command_recognized',
                    command: command
                }, `chrome-extension://${chrome.runtime.id}`);
                
                // 也发送给后台脚本以便处理
                chrome.runtime.sendMessage({
                    action: 'commandRecognized',
                    command: command
                });
            }
        };
        
        recognition.onerror = (event) => {
            console.error('语音识别错误:', event.error);
            statusElement.textContent = '错误: ' + event.error;
            isListening = false;
            updateButtonStates();
        };
        
        return true;
    }
    
    // 请求麦克风权限
    async function requestMicrophonePermission() {
        try {
            statusElement.textContent = '正在请求麦克风权限...';
            
            // 请求麦克风访问权限
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            
            // 权限已授予，初始化语音识别
            if (initializeSpeechRecognition()) {
                // 通知主扩展权限已授予
                window.opener.postMessage({
                    type: 'permission_granted'
                }, `chrome-extension://${chrome.runtime.id}`);
                
                // 开始监听
                startListening();
            }
        } catch (error) {
            console.error('麦克风权限错误:', error);
            statusElement.textContent = '麦克风权限被拒绝。请点击允许访问麦克风。';
            
            // 通知主扩展权限被拒绝
            window.opener.postMessage({
                type: 'permission_denied'
            }, `chrome-extension://${chrome.runtime.id}`);
        }
    }
    
    // 开始监听
    function startListening() {
        if (recognition) {
            try {
                recognition.start();
                isListening = true;
                updateButtonStates();
            } catch (error) {
                console.error('启动语音识别错误:', error);
                statusElement.textContent = '启动语音识别失败。请重试。';
            }
        }
    }
    
    // 停止监听
    function stopListening() {
        if (recognition) {
            recognition.stop();
            isListening = false;
            statusElement.textContent = '语音识别已停止。';
            updateButtonStates();
        }
    }
    
    // 更新按钮状态
    function updateButtonStates() {
        requestPermissionBtn.disabled = isListening;
        stopListeningBtn.disabled = !isListening;
    }
});