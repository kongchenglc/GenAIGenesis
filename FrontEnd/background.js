chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'OPEN_URL') {
        chrome.tabs.create({ url: message.url });
    }
});