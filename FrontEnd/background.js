// 监听插件图标点击
chrome.action.onClicked.addListener((tab) => {
    // 发送消息给content script来显示权限页面
    chrome.tabs.sendMessage(tab.id, {
        type: 'SHOW_PERMISSION_PAGE'
    });
});

// 监听来自内容脚本的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'OPEN_PERMISSION_PAGE') {
        // 创建一个新标签页来打开权限页面
        chrome.tabs.create({ url: message.url });
    } else if (message.type === 'PERMISSION_GRANTED') {
        console.log('麦克风权限已授予');
        // 可以在这里进行其他操作，例如更新扩展图标等
    } else if (message.type === 'PERMISSION_DENIED') {
        console.log('麦克风权限被拒绝');
        // 可以在这里进行其他操作，例如更新扩展图标等
    } else if (message.type === 'START_VOICE_RECOGNITION') {
        console.log('开始语音识别');
        // 在这里处理长按空格键后已获取权限的逻辑
        // 可以与permission.js通信，开始语音识别
    }
});
