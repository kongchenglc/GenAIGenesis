// 添加到 background.js 中的适当位置
// 在扩展启动或安装时自动打开权限页面
let hasOpenedPermissionPage = false;

// 扩展启动时自动打开权限页面
chrome.runtime.onStartup.addListener(() => {
    openPermissionPageIfNeeded();
});

// 扩展安装或更新时也打开权限页面
chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason === 'install' || details.reason === 'update') {
        // 先打开选项页
        chrome.runtime.openOptionsPage();
        // 然后打开权限页面
        setTimeout(openPermissionPageIfNeeded, 1000);
    }
});

// 自动打开权限页面的函数
function openPermissionPageIfNeeded() {
    if (!hasOpenedPermissionPage) {
        const extensionId = chrome.runtime.id;
        const permissionUrl = `chrome-extension://${extensionId}/permission.html`;
        
        chrome.tabs.create({ url: permissionUrl }, (tab) => {
            permissionTabId = tab.id;
            hasOpenedPermissionPage = true;
        });
    }
}

// 扩展图标被点击时，确保权限页面打开
chrome.action.onClicked.addListener(() => {
    if (!permissionTabId) {
        openPermissionPageIfNeeded();
    } else {
        // 检查权限页面是否仍然存在
        chrome.tabs.get(permissionTabId, (tab) => {
            if (chrome.runtime.lastError) {
                // Tab不存在，需要重新打开
                openPermissionPageIfNeeded();
            } else {
                // Tab存在，切换到该Tab
                chrome.tabs.update(permissionTabId, { active: true });
            }
        });
    }
});