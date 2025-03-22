// 创建 overlay
let voiceOverlay = document.createElement('div');
voiceOverlay.id = 'voice-control-overlay';
voiceOverlay.innerHTML = `
      <div class="voice-status">
          <div class="voice-indicator"></div>
          <span class="status-text">长按空格键开始语音助手</span>
      </div>
  `;
document.body.appendChild(voiceOverlay);

// 添加样式
if (!document.getElementById('voice-control-style')) {
    const style = document.createElement('style');
    style.id = 'voice-control-style';
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
              background: #f0ad4e; /* 黄色表示待命状态 */
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

// 长按空格键检测相关变量
let spaceKeyDown = false;
let longPressTimer = null;
const LONG_PRESS_DURATION = 500; // 长按500ms触发
let permissionRequested = false;

// 请求麦克风权限的函数
async function requestMicrophonePermission() {
    if (permissionRequested) return;
    
    try {
        // 更新UI状态
        document.querySelector('.status-text').textContent = '正在请求麦克风权限...';
        document.querySelector('.voice-indicator').style.background = '#f0ad4e'; // 黄色表示处理中
        
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
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        permissionRequested = true;

        // 如果权限被授予，更新overlay状态
        console.log('麦克风权限已授予');
        document.querySelector('.status-text').textContent = '麦克风权限已授权，开始录音...';
        document.querySelector('.voice-indicator').style.background = '#4CAF50'; // 绿色表示成功

        // 通知background.js权限已授予
        chrome.runtime.sendMessage({ type: 'PERMISSION_GRANTED' });

        // 语音识别逻辑可以直接在这里实现，或通过消息传递给permission.js处理
        return stream;
    } catch (error) {
        // 请求失败，更新overlay状态
        console.error('麦克风权限被拒绝:', error);
        document.querySelector('.status-text').textContent = '麦克风权限被拒绝，请重试';
        document.querySelector('.voice-indicator').style.background = '#F44336'; // 红色表示失败
        permissionRequested = false;

        // 通知background.js权限被拒绝
        chrome.runtime.sendMessage({ type: 'PERMISSION_DENIED' });

        // 根据错误类型显示不同的消息
        if (error.name === 'NotAllowedError') {
            console.log('用户拒绝了麦克风权限');
        } else if (error.name === 'NotFoundError') {
            console.log('未找到麦克风设备');
            document.querySelector('.status-text').textContent = '未找到麦克风设备';
        } else {
            console.log('权限错误:', error);
        }
        
        return null;
    }
}

// 打开 permission.html 页面请求权限
function openPermissionPage() {
    // 使用chrome.runtime.getURL获取permission.html的完整URL
    const permissionUrl = chrome.runtime.getURL('permission.html');
    // 通知background.js打开权限页面
    chrome.runtime.sendMessage({ 
        type: 'OPEN_PERMISSION_PAGE', 
        url: permissionUrl 
    });
}

// 处理空格键按下
function handleSpaceKeyDown() {
    if (longPressTimer === null) {
        spaceKeyDown = true;
        longPressTimer = setTimeout(async () => {
            // 长按超过阈值，请求麦克风权限
            console.log('空格键长按，请求麦克风权限');
            document.querySelector('.status-text').textContent = '正在启动语音助手...';
            
            const stream = await requestMicrophonePermission();
            if (stream) {
                // 权限已获取，可以在这里处理录音逻辑
                // 或者发送消息到background.js通知permission.js处理
                chrome.runtime.sendMessage({ 
                    type: 'START_VOICE_RECOGNITION'
                });
            }
            
        }, LONG_PRESS_DURATION);
    }
}

// 处理空格键释放
function handleSpaceKeyUp() {
    if (spaceKeyDown) {
        spaceKeyDown = false;
        if (longPressTimer !== null) {
            clearTimeout(longPressTimer);
            longPressTimer = null;
            
            // 如果已经获得权限，但长按未到达阈值，则恢复待命状态
            if (!permissionRequested) {
                document.querySelector('.status-text').textContent = '长按空格键开始语音助手';
                document.querySelector('.voice-indicator').style.background = '#f0ad4e';
            }
        }
    }
}

// 添加键盘事件监听器
document.addEventListener('keydown', (event) => {
    // 仅在按下空格键且不在输入框中时触发
    if (event.code === 'Space' && 
        !['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) {
        // 阻止默认行为（页面滚动等）
        event.preventDefault();
        handleSpaceKeyDown();
    }
});

document.addEventListener('keyup', (event) => {
    if (event.code === 'Space') {
        handleSpaceKeyUp();
    }
});

// 监听来自background.js的消息
chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'OPEN_PERMISSION_REQUEST') {
        // 当用户点击扩展图标时，也可以请求权限
        requestMicrophonePermission();
    } else if (message.type === 'SHOW_PERMISSION_PAGE') {
        // 直接打开权限页面
        openPermissionPage();
    }
});