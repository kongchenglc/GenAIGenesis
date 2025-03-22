// 创建 overlay
let voiceOverlay = document.createElement('div');
voiceOverlay.id = 'voice-control-overlay';
voiceOverlay.innerHTML = `
      <div class="voice-status">
          <div class="voice-indicator"></div>
          <span class="status-text">AI助手已准备就绪</span>
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