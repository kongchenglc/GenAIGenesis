// 监听插件图标点击
chrome.action.onClicked.addListener((tab) => {
    // 发送消息给content script来显示权限页面
    chrome.tabs.sendMessage(tab.id, {
        type: 'SHOW_PERMISSION_PAGE'
    });
});
